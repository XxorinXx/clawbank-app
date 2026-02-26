"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import * as multisig from "@sqds/multisig";
import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import { getSponsorKey, getRpcUrl } from "../env";
import { buildAgentActivationTxCore } from "../lib/txBuilders";
import { extractErrorMessage, NATIVE_SOL_MINT } from "../lib/turnkeyHelpers";

export const buildAgentActivationTx = action({
  args: {
    agentId: v.id("agents"),
    workspaceId: v.id("workspaces"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ serializedTx: string; createKey: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    // Look up user's wallet address
    const user = await ctx.runQuery(
      internal.internals.workspaceHelpers.getUserByToken,
      { tokenIdentifier: identity.tokenIdentifier },
    );
    if (!user) throw new Error("User not found");

    // Load workspace for multisig PDA
    const workspace = await ctx.runQuery(
      internal.internals.workspaceHelpers.getWorkspaceById,
      { workspaceId: args.workspaceId },
    );
    if (!workspace) throw new Error("Workspace not found");

    // Load agent for public key
    const agent = await ctx.runQuery(
      internal.internals.agentHelpers.getAgentById,
      { agentId: args.agentId },
    );
    if (!agent || !agent.publicKey) {
      throw new Error("Agent not found or not provisioned");
    }

    // Load spending limit for token/amount/period
    const limits = await ctx.runQuery(
      internal.internals.agentHelpers.getSpendingLimitsByAgent,
      { agentId: args.agentId },
    );
    if (limits.length === 0) {
      throw new Error("No spending limit configured for agent");
    }
    const limit = limits[0];

    // Get token decimals
    const tokenMeta = await ctx.runQuery(
      internal.internals.agentHelpers.getTokenMetadata,
      { mint: limit.tokenMint },
    );
    const decimals = tokenMeta?.decimals ?? 9;

    const connection = new Connection(getRpcUrl(), "confirmed");
    const multisigPda = new PublicKey(workspace.settingsAddress);
    const sponsorKeypair = Keypair.fromSecretKey(getSponsorKey());
    const agentPubkey = new PublicKey(agent.publicKey);
    const userWallet = new PublicKey(user.walletAddress);

    // Read current multisig transaction index
    const multisigAccount =
      await multisig.accounts.Multisig.fromAccountAddress(
        connection,
        multisigPda,
      );
    const currentTransactionIndex = Number(multisigAccount.transactionIndex);

    // Guard: if agent is already an on-chain member, don't add again
    const agentAlreadyMember = multisigAccount.members.some(
      (m: multisig.types.Member) =>
        m.key.toBase58() === agentPubkey.toBase58(),
    );
    if (agentAlreadyMember) {
      throw new Error("Agent is already an on-chain multisig member");
    }

    // Generate createKey for spending limit PDA
    const createKey = Keypair.generate();
    const { blockhash } = await connection.getLatestBlockhash();

    // For native SOL, Squads expects mint = PublicKey.default (all zeros)
    const tokenMintPubkey =
      limit.tokenMint === NATIVE_SOL_MINT
        ? PublicKey.default
        : new PublicKey(limit.tokenMint);

    const { tx } = buildAgentActivationTxCore({
      userWallet,
      sponsorPublicKey: sponsorKeypair.publicKey,
      multisigPda,
      agentPubkey,
      currentTransactionIndex,
      createKeyPublicKey: createKey.publicKey,
      tokenMint: tokenMintPubkey,
      limitAmount: limit.limitAmount,
      decimals,
      periodType: limit.periodType,
      blockhash,
    });

    // Partial-sign with sponsor (fee payer) — user signs on frontend
    tx.sign([sponsorKeypair]);

    const serializedTx = Buffer.from(tx.serialize()).toString("base64");

    return {
      serializedTx,
      createKey: createKey.publicKey.toBase58(),
    };
  },
});

export const submitAgentActivationTx = action({
  args: {
    agentId: v.id("agents"),
    signedTx: v.string(),
    createKey: v.string(),
  },
  handler: async (ctx, args): Promise<{ txSignature: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const connection = new Connection(getRpcUrl(), "confirmed");

    const txBytes = Buffer.from(args.signedTx, "base64");
    const tx = VersionedTransaction.deserialize(txBytes);

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    let signature: string;
    try {
      signature = await connection.sendTransaction(tx, {
        skipPreflight: false,
      });
    } catch (err: unknown) {
      throw new Error(`Failed to submit activation tx: ${extractErrorMessage(err, "Unknown Solana error")}`);
    }

    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );

    // On-chain tx confirmed — now set agent to "active" (atomic: only active after on-chain success)
    await ctx.runMutation(
      internal.internals.agentHelpers.updateAgentStatus,
      { agentId: args.agentId, status: "active" },
    );

    // Load agent once for both onchain key update and activity log
    const agent = await ctx.runQuery(
      internal.internals.agentHelpers.getAgentById,
      { agentId: args.agentId },
    );
    if (!agent) throw new Error("Agent not found after activation");

    // Store on-chain state
    await ctx.runMutation(
      internal.internals.agentHelpers.updateSpendingLimitOnchainKey,
      {
        agentId: args.agentId,
        workspaceId: agent.workspaceId,
        onchainCreateKey: args.createKey,
      },
    );

    // Log activity
    await ctx.runMutation(internal.internals.agentHelpers.logActivity, {
      workspaceId: agent.workspaceId,
      agentId: args.agentId,
      actorType: "human",
      actorLabel: identity.email ?? "Unknown",
      category: "agent_lifecycle",
      action: "agent_activated",
      txSignature: signature,
    });

    return { txSignature: signature };
  },
});
