"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import { getSponsorKey, getRpcUrl } from "../env";
import { buildSpendingLimitUpdateTxCore } from "../lib/txBuilders";
import { extractErrorMessage, NATIVE_SOL_MINT } from "../lib/turnkeyHelpers";

export const buildSpendingLimitUpdateTx = action({
  args: {
    agentId: v.id("agents"),
    workspaceId: v.id("workspaces"),
    tokenMint: v.string(),
    limitAmount: v.number(),
    periodType: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ serializedTx: string; createKey: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    // Look up user's wallet
    const user = await ctx.runQuery(
      internal.internals.workspaceHelpers.getUserByToken,
      { tokenIdentifier: identity.tokenIdentifier },
    );
    if (!user) throw new Error("User not found");

    const workspace = await ctx.runQuery(
      internal.internals.workspaceHelpers.getWorkspaceById,
      { workspaceId: args.workspaceId },
    );
    if (!workspace) throw new Error("Workspace not found");

    const agent = await ctx.runQuery(
      internal.internals.agentHelpers.getAgentById,
      { agentId: args.agentId },
    );
    if (!agent || !agent.publicKey) {
      throw new Error("Agent not found or not provisioned");
    }

    // Get existing spending limit to find old on-chain key
    const limits = await ctx.runQuery(
      internal.internals.agentHelpers.getSpendingLimitsByAgent,
      { agentId: args.agentId },
    );
    const existingLimit = limits[0];
    const oldOnchainCreateKey = existingLimit?.onchainCreateKey;

    const tokenMeta = await ctx.runQuery(
      internal.internals.agentHelpers.getTokenMetadata,
      { mint: args.tokenMint },
    );
    const decimals = tokenMeta?.decimals ?? 9;

    const connection = new Connection(getRpcUrl(), "confirmed");
    const multisigPda = new PublicKey(workspace.settingsAddress);
    const sponsorKeypair = Keypair.fromSecretKey(getSponsorKey());
    const agentPubkey = new PublicKey(agent.publicKey);
    const userWallet = new PublicKey(user.walletAddress);

    const createKey = Keypair.generate();
    const { blockhash } = await connection.getLatestBlockhash();

    const { tx } = buildSpendingLimitUpdateTxCore({
      userWallet,
      sponsorPublicKey: sponsorKeypair.publicKey,
      settingsPda: multisigPda,
      agentPubkey,
      oldSeed: oldOnchainCreateKey ?? null,
      seed: createKey.publicKey,
      tokenMint: args.tokenMint === NATIVE_SOL_MINT
        ? PublicKey.default
        : new PublicKey(args.tokenMint),
      limitAmount: args.limitAmount,
      decimals,
      periodType: args.periodType,
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

export const submitSpendingLimitUpdateTx = action({
  args: {
    agentId: v.id("agents"),
    workspaceId: v.id("workspaces"),
    signedTx: v.string(),
    createKey: v.string(),
    tokenMint: v.string(),
    limitAmount: v.number(),
    periodType: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
    ),
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
      throw new Error(`Failed to update spending limit on-chain: ${extractErrorMessage(err, "Unknown Solana error")}`);
    }

    try {
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
    } catch (err: unknown) {
      throw new Error(
        `Spending limit transaction failed to confirm: ${extractErrorMessage(err, "Unknown confirmation error")}`,
      );
    }

    // On-chain confirmed — now update DB
    // Update spending limit record
    await ctx.runMutation(
      internal.internals.agentHelpers.updateSpendingLimitRecord,
      {
        agentId: args.agentId,
        workspaceId: args.workspaceId,
        tokenMint: args.tokenMint,
        limitAmount: args.limitAmount,
        periodType: args.periodType,
        onchainCreateKey: args.createKey,
      },
    );

    // Log activity
    await ctx.runMutation(internal.internals.agentHelpers.logActivity, {
      workspaceId: args.workspaceId,
      agentId: args.agentId,
      actorType: "human",
      actorLabel: identity.email ?? "Unknown",
      category: "config",
      action: "spending_limit_updated",
      txSignature: signature,
    });

    return { txSignature: signature };
  },
});
