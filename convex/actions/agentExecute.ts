"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import * as smartAccount from "@sqds/smart-account";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { getRpcUrl, getSponsorKey } from "../env";
import {
  signWithTurnkey,
  extractErrorMessage,
  NATIVE_SOL_MINT,
} from "../lib/turnkeyHelpers";
import {
  checkSpendingLimit,
  solToLamports,
} from "../lib/spendingLimitPolicy";
import { sha256Hex } from "../lib/connectCode";
import {
  deserializeInstructions,
  replaceVaultPlaceholder,
  validateProgramAllowlist,
  DEFAULT_PROGRAM_ALLOWLIST,
} from "../lib/instructionValidator";
import type { InstructionJson } from "../lib/instructionValidator";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

interface ExecuteResult {
  requestId: string;
  status: string;
  txSignature?: string;
  proposalAddress?: string;
}

export const agentExecute = action({
  args: {
    sessionToken: v.string(),
    instructions: v.array(
      v.object({
        programId: v.string(),
        keys: v.array(
          v.object({
            pubkey: v.string(),
            isSigner: v.boolean(),
            isWritable: v.boolean(),
          }),
        ),
        data: v.string(),
      }),
    ),
    shortNote: v.string(),
    description: v.string(),
    estimatedValueSol: v.number(),
  },
  handler: async (ctx, args): Promise<ExecuteResult> => {
    // ── Auth (same pattern as agentTransfer) ──────────────────────────
    const tokenHash = sha256Hex(args.sessionToken);

    const session = await ctx.runQuery(
      internal.internals.agentHelpers.getSessionByHash,
      { tokenHash },
    );

    if (
      !session ||
      (session.sessionType !== "session" && session.sessionType !== "access") ||
      session.expiresAt <= Date.now()
    ) {
      throw new Error("Invalid or expired session");
    }

    const agentId = session.agentId;

    // Update lastUsedAt
    await ctx.runMutation(
      internal.internals.agentHelpers.updateSessionLastUsed,
      { sessionId: session._id },
    );

    // ── Validation ───────────────────────────────────────────────────
    const note = args.shortNote.trim();
    const desc = args.description.trim();
    if (note.length === 0 || note.length > 80) {
      throw new Error("shortNote must be 1-80 characters");
    }
    if (desc.length === 0) {
      throw new Error("description must not be empty");
    }
    if (args.estimatedValueSol < 0) {
      throw new Error("estimatedValueSol must not be negative");
    }
    if (args.instructions.length === 0) {
      throw new Error("At least one instruction required");
    }
    if (args.instructions.length > 5) {
      throw new Error("Maximum 5 instructions allowed");
    }

    const agent = await ctx.runQuery(
      internal.internals.agentHelpers.getAgentById,
      { agentId },
    );
    if (!agent) throw new Error("Agent not found");
    if (agent.status !== "active") throw new Error("Agent is not active");
    if (!agent.publicKey) throw new Error("Agent has no public key");

    const workspace = await ctx.runQuery(
      internal.internals.workspaceHelpers.getWorkspaceById,
      { workspaceId: agent.workspaceId },
    );
    if (!workspace) throw new Error("Workspace not found");

    // ── Instruction validation ───────────────────────────────────────
    const settingsPda = new PublicKey(workspace.settingsAddress);
    const [smartAccountPda] = smartAccount.getSmartAccountPda({
      settingsPda,
      accountIndex: 0,
    });

    // Replace VAULT_PDA placeholder with actual vault PDA
    const resolvedInstructions = replaceVaultPlaceholder(
      args.instructions as InstructionJson[],
      smartAccountPda,
    );

    // Deserialize and validate
    const txInstructions = deserializeInstructions(resolvedInstructions);

    // Check program allowlist (use workspace-specific if set, else default)
    const allowlist =
      (workspace as Record<string, unknown>).programAllowlist as
        | string[]
        | undefined ?? DEFAULT_PROGRAM_ALLOWLIST;
    validateProgramAllowlist(txInstructions, allowlist);

    // ── Spending limit check ─────────────────────────────────────────
    const limits = await ctx.runQuery(
      internal.internals.agentHelpers.getSpendingLimitsByAgent,
      { agentId },
    );
    const solLimit = limits.find(
      (l: { tokenMint: string }) => l.tokenMint === NATIVE_SOL_MINT,
    );

    let allowed = false;
    let snapshot: { limitAmount: number; spentAmount: number; periodType: string };

    if (!solLimit || !solLimit.onchainCreateKey) {
      // No spending limit configured — force proposal
      allowed = false;
      snapshot = { limitAmount: 0, spentAmount: 0, periodType: "daily" };
    } else {
      const result = checkSpendingLimit({
        spentAmount: solLimit.spentAmount,
        limitAmount: solLimit.limitAmount,
        requestAmount: args.estimatedValueSol,
        periodStart: solLimit.periodStart,
        periodType: solLimit.periodType,
      });
      allowed = result.allowed;
      snapshot = {
        limitAmount: solLimit.limitAmount,
        spentAmount: solLimit.spentAmount,
        periodType: solLimit.periodType,
      };
    }

    // ── Shared setup ─────────────────────────────────────────────────
    const connection = new Connection(getRpcUrl(), "confirmed");
    const agentPubkey = new PublicKey(agent.publicKey);
    const sponsorKeypair = Keypair.fromSecretKey(getSponsorKey());

    // Collect unique program IDs for metadata
    const programIds = [
      ...new Set(txInstructions.map((ix) => ix.programId.toBase58())),
    ];

    const metadata = {
      type: "execute" as const,
      instructionCount: txInstructions.length,
      programs: programIds,
      estimatedValueSol: args.estimatedValueSol,
    };

    // Arbitrary instructions always require human approval via proposal.
    // The spending limit check determines if the request is flagged as
    // "within_budget" (informational) — the human still approves either way.
    return await createProposal(ctx, {
      agentId,
      workspaceId: agent.workspaceId,
      note,
      desc,
      snapshot,
      connection,
      settingsPda,
      smartAccountPda,
      agentPubkey,
      sponsorKeypair,
      txInstructions,
      estimatedValueSol: args.estimatedValueSol,
      metadata: { ...metadata, withinBudget: allowed },
    });
  },
});

// ── Create vault tx + proposal — human approves later ──────────────────────

interface ProposalParams {
  agentId: Id<"agents">;
  workspaceId: Id<"workspaces">;
  note: string;
  desc: string;
  snapshot: { limitAmount: number; spentAmount: number; periodType: string };
  connection: Connection;
  settingsPda: PublicKey;
  smartAccountPda: PublicKey;
  agentPubkey: PublicKey;
  sponsorKeypair: Keypair;
  txInstructions: InstanceType<typeof import("@solana/web3.js").TransactionInstruction>[];
  estimatedValueSol: number;
  metadata: {
    type: "execute";
    instructionCount: number;
    programs: string[];
    estimatedValueSol: number;
    withinBudget?: boolean;
  };
}

async function createProposal(
  ctx: ActionCtx,
  p: ProposalParams,
): Promise<ExecuteResult> {
  const requestId = await ctx.runMutation(
    internal.internals.transferHelpers.createTransferRequest,
    {
      agentId: p.agentId,
      workspaceId: p.workspaceId,
      recipient: p.smartAccountPda.toBase58(),
      amountLamports: solToLamports(p.estimatedValueSol),
      shortNote: p.note,
      description: p.desc,
      status: "pending_approval" as const,
      spendingLimitSnapshot: p.snapshot,
      metadata: p.metadata,
    },
  );

  try {
    const settingsAccount =
      await smartAccount.accounts.Settings.fromAccountAddress(
        p.connection,
        p.settingsPda,
      );
    const nextTransactionIndex = BigInt(
      Number(settingsAccount.transactionIndex) + 1,
    );

    // Build vault transaction message with the agent's instructions
    const vaultTxMessage = new TransactionMessage({
      payerKey: p.smartAccountPda,
      recentBlockhash: PublicKey.default.toBase58(),
      instructions: p.txInstructions,
    });

    // Create vault transaction
    const txCreateIx = smartAccount.instructions.createTransaction({
      settingsPda: p.settingsPda,
      transactionIndex: nextTransactionIndex,
      creator: p.agentPubkey,
      rentPayer: p.sponsorKeypair.publicKey,
      accountIndex: 0,
      ephemeralSigners: 0,
      transactionMessage: vaultTxMessage,
    });

    // Create proposal
    const proposalCreateIx = smartAccount.instructions.createProposal({
      settingsPda: p.settingsPda,
      transactionIndex: nextTransactionIndex,
      creator: p.agentPubkey,
      rentPayer: p.sponsorKeypair.publicKey,
    });

    const { blockhash, lastValidBlockHeight } =
      await p.connection.getLatestBlockhash("confirmed");

    const messageV0 = new TransactionMessage({
      payerKey: p.sponsorKeypair.publicKey,
      recentBlockhash: blockhash,
      instructions: [txCreateIx, proposalCreateIx],
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);

    // Sign with sponsor (fee payer)
    tx.sign([p.sponsorKeypair]);

    // Sign with agent via Turnkey
    const signedTx = await signWithTurnkey(tx, p.agentPubkey.toBase58());

    const signature = await p.connection.sendTransaction(signedTx, {
      skipPreflight: false,
    });

    await p.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );

    // Derive the proposal PDA for storage
    const [proposalPda] = smartAccount.getProposalPda({
      settingsPda: p.settingsPda,
      transactionIndex: nextTransactionIndex,
    });

    // Update request with proposal info
    await ctx.runMutation(
      internal.internals.transferHelpers.updateTransferRequestStatus,
      {
        requestId,
        status: "pending_approval" as const,
        txSignature: signature,
        proposalAddress: proposalPda.toBase58(),
        proposalIndex: Number(nextTransactionIndex),
      },
    );

    // Log activity
    const [agentForProposalLog, proposalSolPrices] = await Promise.all([
      ctx.runQuery(internal.internals.agentHelpers.getAgentById, {
        agentId: p.agentId,
      }),
      ctx.runAction(internal.actions.fetchTokenPrices.fetchTokenPrices, {
        mints: [NATIVE_SOL_MINT],
      }),
    ]);
    const proposalSolPrice = proposalSolPrices[0]?.priceUsd ?? 0;
    const proposalUsdValue = p.estimatedValueSol * proposalSolPrice;
    await ctx.runMutation(internal.internals.agentHelpers.logActivity, {
      workspaceId: p.workspaceId,
      agentId: p.agentId,
      actorType: "agent",
      actorLabel: agentForProposalLog?.name ?? "Unknown Agent",
      category: "transaction",
      action: "execute_proposal_created",
      txSignature: signature,
      amount: solToLamports(p.estimatedValueSol),
      tokenMint: NATIVE_SOL_MINT,
      metadata: {
        proposalAddress: proposalPda.toBase58(),
        proposalIndex: Number(nextTransactionIndex),
        programs: p.metadata.programs,
        instructionCount: p.metadata.instructionCount,
        usdValue: proposalUsdValue,
      },
    });

    return {
      requestId: requestId as string,
      status: "pending_approval",
      proposalAddress: proposalPda.toBase58(),
    };
  } catch (err: unknown) {
    const errorMsg = extractErrorMessage(err);

    await ctx.runMutation(
      internal.internals.transferHelpers.updateTransferRequestStatus,
      {
        requestId,
        status: "failed" as const,
        errorMessage: errorMsg,
      },
    );

    const agentForProposalFailLog = await ctx.runQuery(
      internal.internals.agentHelpers.getAgentById,
      { agentId: p.agentId },
    );
    await ctx.runMutation(internal.internals.agentHelpers.logActivity, {
      workspaceId: p.workspaceId,
      agentId: p.agentId,
      actorType: "agent",
      actorLabel: agentForProposalFailLog?.name ?? "Unknown Agent",
      category: "transaction",
      action: "execute_proposal_failed",
      metadata: { error: errorMsg },
    });

    throw new Error(`Execute proposal creation failed: ${errorMsg}`);
  }
}
