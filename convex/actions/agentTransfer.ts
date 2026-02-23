"use node";

import crypto from "node:crypto";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import * as multisig from "@sqds/multisig";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { Turnkey } from "@turnkey/sdk-server";
import {
  getRpcUrl,
  getSponsorKey,
  getTurnkeyApiPublicKey,
  getTurnkeyApiPrivateKey,
  getTurnkeyOrgId,
} from "../env";
import { checkSpendingLimit, solToLamports, lamportsToSol } from "../lib/spendingLimitPolicy";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

const SOL_MINT = "So11111111111111111111111111111111111111112";

interface TransferResult {
  requestId: string;
  status: string;
  txSignature?: string;
  proposalAddress?: string;
}

export const agentTransfer = action({
  args: {
    sessionToken: v.string(),
    recipient: v.string(),
    amountSol: v.number(),
    shortNote: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args): Promise<TransferResult> => {
    // ── Auth ──────────────────────────────────────────────────────────
    const tokenHash = crypto
      .createHash("sha256")
      .update(args.sessionToken)
      .digest("hex");

    const session = await ctx.runQuery(
      internal.internals.agentHelpers.getSessionByHash,
      { tokenHash },
    );

    if (
      !session ||
      session.sessionType !== "session" ||
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
    if (args.amountSol <= 0) {
      throw new Error("amountSol must be positive");
    }

    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(args.recipient);
    } catch {
      throw new Error("Invalid recipient address");
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

    // ── Spending limit check ─────────────────────────────────────────
    const amountLamports = solToLamports(args.amountSol);

    const limits = await ctx.runQuery(
      internal.internals.agentHelpers.getSpendingLimitsByAgent,
      { agentId },
    );
    const solLimit = limits.find((l) => l.tokenMint === SOL_MINT);

    let allowed = false;
    let snapshot: { limitAmount: number; spentAmount: number; periodType: string };

    if (!solLimit || !solLimit.onchainCreateKey) {
      // No spending limit configured — force proposal
      allowed = false;
      snapshot = { limitAmount: 0, spentAmount: 0, periodType: "daily" };
    } else {
      // DB stores limitAmount and spentAmount in SOL, so convert request to SOL
      const result = checkSpendingLimit({
        spentAmount: solLimit.spentAmount,
        limitAmount: solLimit.limitAmount,
        requestAmountLamports: lamportsToSol(amountLamports),
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
    const multisigPda = new PublicKey(workspace.multisigAddress);
    const agentPubkey = new PublicKey(agent.publicKey);
    const sponsorKeypair = Keypair.fromSecretKey(getSponsorKey());

    if (allowed) {
      return await executeUnderLimit(ctx, {
        agentId,
        workspaceId: agent.workspaceId,
        recipientPubkey,
        amountLamports,
        note,
        desc,
        snapshot,
        solLimit: solLimit!,
        connection,
        multisigPda,
        agentPubkey,
        sponsorKeypair,
        agent,
      });
    } else {
      return await createProposal(ctx, {
        agentId,
        workspaceId: agent.workspaceId,
        recipientPubkey,
        amountLamports,
        note,
        desc,
        snapshot,
        connection,
        multisigPda,
        agentPubkey,
        sponsorKeypair,
      });
    }
  },
});

// ── Under-limit: use spending limit instruction ────────────────────────

interface UnderLimitParams {
  agentId: Id<"agents">;
  workspaceId: Id<"workspaces">;
  recipientPubkey: PublicKey;
  amountLamports: number;
  note: string;
  desc: string;
  snapshot: { limitAmount: number; spentAmount: number; periodType: string };
  solLimit: { onchainCreateKey?: string; tokenMint: string };
  connection: Connection;
  multisigPda: PublicKey;
  agentPubkey: PublicKey;
  sponsorKeypair: Keypair;
  agent: { publicKey?: string };
}

async function executeUnderLimit(
  ctx: ActionCtx,
  p: UnderLimitParams,
): Promise<TransferResult> {
  const requestId = await ctx.runMutation(
    internal.internals.transferHelpers.createTransferRequest,
    {
      agentId: p.agentId,
      workspaceId: p.workspaceId,
      recipient: p.recipientPubkey.toBase58(),
      amountLamports: p.amountLamports,
      shortNote: p.note,
      description: p.desc,
      status: "pending_execution" as const,
      spendingLimitSnapshot: p.snapshot,
    },
  );

  try {
    // Build spending limit use instruction
    const [spendingLimitPda] = multisig.getSpendingLimitPda({
      multisigPda: p.multisigPda,
      createKey: new PublicKey(p.solLimit.onchainCreateKey!),
    });

    // For native SOL, omit `mint` — the SDK handles SOL transfers natively
    const useIx = multisig.instructions.spendingLimitUse({
      multisigPda: p.multisigPda,
      member: p.agentPubkey,
      spendingLimit: spendingLimitPda,
      destination: p.recipientPubkey,
      vaultIndex: 0,
      amount: p.amountLamports,
      decimals: 9,
    });

    const { blockhash, lastValidBlockHeight } =
      await p.connection.getLatestBlockhash("confirmed");

    const messageV0 = new TransactionMessage({
      payerKey: p.sponsorKeypair.publicKey,
      recentBlockhash: blockhash,
      instructions: [useIx],
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);

    // Sign with sponsor (fee payer)
    tx.sign([p.sponsorKeypair]);

    // Sign with agent via Turnkey
    const signedTx = await signWithTurnkey(tx, p.agent.publicKey!);

    const signature = await p.connection.sendTransaction(signedTx, {
      skipPreflight: false,
    });

    await p.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );

    // Update request to executed
    await ctx.runMutation(
      internal.internals.transferHelpers.updateTransferRequestStatus,
      {
        requestId,
        status: "executed" as const,
        txSignature: signature,
      },
    );

    // Update spent amount (DB stores in SOL)
    await ctx.runMutation(
      internal.internals.transferHelpers.updateSpentAmount,
      {
        agentId: p.agentId,
        tokenMint: SOL_MINT,
        additionalSpent: lamportsToSol(p.amountLamports),
      },
    );

    // Log activity
    await ctx.runMutation(internal.internals.agentHelpers.logActivity, {
      workspaceId: p.workspaceId,
      agentId: p.agentId,
      action: "transfer_executed",
      txSignature: signature,
      amount: p.amountLamports,
      tokenMint: SOL_MINT,
    });

    return {
      requestId: requestId as string,
      status: "executed",
      txSignature: signature,
    };
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error";

    await ctx.runMutation(
      internal.internals.transferHelpers.updateTransferRequestStatus,
      {
        requestId,
        status: "failed" as const,
        errorMessage,
      },
    );

    await ctx.runMutation(internal.internals.agentHelpers.logActivity, {
      workspaceId: p.workspaceId,
      agentId: p.agentId,
      action: "transfer_failed",
      metadata: { error: errorMessage },
    });

    throw new Error(`Transfer execution failed: ${errorMessage}`);
  }
}

// ── Over-limit: create Squads vault transaction proposal ───────────────

interface ProposalParams {
  agentId: Id<"agents">;
  workspaceId: Id<"workspaces">;
  recipientPubkey: PublicKey;
  amountLamports: number;
  note: string;
  desc: string;
  snapshot: { limitAmount: number; spentAmount: number; periodType: string };
  connection: Connection;
  multisigPda: PublicKey;
  agentPubkey: PublicKey;
  sponsorKeypair: Keypair;
}

async function createProposal(
  ctx: ActionCtx,
  p: ProposalParams,
): Promise<TransferResult> {
  const requestId = await ctx.runMutation(
    internal.internals.transferHelpers.createTransferRequest,
    {
      agentId: p.agentId,
      workspaceId: p.workspaceId,
      recipient: p.recipientPubkey.toBase58(),
      amountLamports: p.amountLamports,
      shortNote: p.note,
      description: p.desc,
      status: "pending_approval" as const,
      spendingLimitSnapshot: p.snapshot,
    },
  );

  try {
    const [vaultPda] = multisig.getVaultPda({
      multisigPda: p.multisigPda,
      index: 0,
    });

    const multisigAccount =
      await multisig.accounts.Multisig.fromAccountAddress(
        p.connection,
        p.multisigPda,
      );
    const nextTransactionIndex = BigInt(
      Number(multisigAccount.transactionIndex) + 1,
    );

    // Build the inner SOL transfer instruction
    const transferIx = SystemProgram.transfer({
      fromPubkey: vaultPda,
      toPubkey: p.recipientPubkey,
      lamports: p.amountLamports,
    });

    // Build vault transaction + proposal
    const vaultTxCreateIx = multisig.instructions.vaultTransactionCreate({
      multisigPda: p.multisigPda,
      transactionIndex: nextTransactionIndex,
      creator: p.agentPubkey,
      rentPayer: p.sponsorKeypair.publicKey,
      vaultIndex: 0,
      ephemeralSigners: 0,
      transactionMessage: new TransactionMessage({
        payerKey: vaultPda,
        recentBlockhash: PublicKey.default.toBase58(),
        instructions: [transferIx],
      }),
    });

    const proposalCreateIx = multisig.instructions.proposalCreate({
      multisigPda: p.multisigPda,
      transactionIndex: nextTransactionIndex,
      creator: p.agentPubkey,
      rentPayer: p.sponsorKeypair.publicKey,
    });

    const { blockhash, lastValidBlockHeight } =
      await p.connection.getLatestBlockhash("confirmed");

    const messageV0 = new TransactionMessage({
      payerKey: p.sponsorKeypair.publicKey,
      recentBlockhash: blockhash,
      instructions: [vaultTxCreateIx, proposalCreateIx],
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
    const [proposalPda] = multisig.getProposalPda({
      multisigPda: p.multisigPda,
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
    await ctx.runMutation(internal.internals.agentHelpers.logActivity, {
      workspaceId: p.workspaceId,
      agentId: p.agentId,
      action: "transfer_proposal_created",
      txSignature: signature,
      amount: p.amountLamports,
      tokenMint: SOL_MINT,
      metadata: {
        proposalAddress: proposalPda.toBase58(),
        proposalIndex: Number(nextTransactionIndex),
      },
    });

    return {
      requestId: requestId as string,
      status: "pending_approval",
      proposalAddress: proposalPda.toBase58(),
    };
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error";

    await ctx.runMutation(
      internal.internals.transferHelpers.updateTransferRequestStatus,
      {
        requestId,
        status: "failed" as const,
        errorMessage,
      },
    );

    await ctx.runMutation(internal.internals.agentHelpers.logActivity, {
      workspaceId: p.workspaceId,
      agentId: p.agentId,
      action: "transfer_proposal_failed",
      metadata: { error: errorMessage },
    });

    throw new Error(`Proposal creation failed: ${errorMessage}`);
  }
}

// ── Turnkey signing helper ─────────────────────────────────────────────

async function signWithTurnkey(
  tx: VersionedTransaction,
  signWithAddress: string,
): Promise<VersionedTransaction> {
  const turnkey = new Turnkey({
    apiBaseUrl: "https://api.turnkey.com",
    apiPublicKey: getTurnkeyApiPublicKey(),
    apiPrivateKey: getTurnkeyApiPrivateKey(),
    defaultOrganizationId: getTurnkeyOrgId(),
  });
  const client = await turnkey.apiClient();

  const messageBytes = tx.message.serialize();
  const signResult = await client.signRawPayload({
    signWith: signWithAddress,
    payload: Buffer.from(messageBytes).toString("hex"),
    encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
    hashFunction: "HASH_FUNCTION_NOT_APPLICABLE",
  });

  // Reconstruct the signature from r + s (each 32 bytes hex = 64 chars)
  const sigBytes = Buffer.from(
    signResult.r + signResult.s,
    "hex",
  );

  // Add the signature at the agent's position
  const agentPubkey = new PublicKey(signWithAddress);
  const signerIndex = tx.message.staticAccountKeys.findIndex((key) =>
    key.equals(agentPubkey),
  );
  if (signerIndex === -1) {
    throw new Error("Agent public key not found in transaction signers");
  }
  tx.signatures[signerIndex] = sigBytes;

  return tx;
}
