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
import { buildAgentRevocationTxCore } from "../lib/txBuilders";

export const buildAgentRevocationTx = action({
  args: {
    agentId: v.id("agents"),
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args): Promise<{ serializedTx: string }> => {
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

    // Load agent
    const agent = await ctx.runQuery(
      internal.internals.agentHelpers.getAgentById,
      { agentId: args.agentId },
    );
    if (!agent) throw new Error("Agent not found");

    // If agent has no publicKey, no on-chain tx needed
    if (!agent.publicKey) {
      return { serializedTx: "" };
    }

    const connection = new Connection(getRpcUrl(), "confirmed");
    const multisigPda = new PublicKey(workspace.multisigAddress);
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

    // Load spending limit for onchainCreateKey
    const limits = await ctx.runQuery(
      internal.internals.agentHelpers.getSpendingLimitsByAgent,
      { agentId: args.agentId },
    );
    const limit = limits[0];
    const onchainCreateKey = limit?.onchainCreateKey ?? null;

    const { blockhash } = await connection.getLatestBlockhash();

    const { tx } = buildAgentRevocationTxCore({
      userWallet,
      sponsorPublicKey: sponsorKeypair.publicKey,
      multisigPda,
      agentPubkey,
      currentTransactionIndex,
      onchainCreateKey,
      blockhash,
    });

    // Partial-sign with sponsor (fee payer) — user signs on frontend
    tx.sign([sponsorKeypair]);

    const serializedTx = Buffer.from(tx.serialize()).toString("base64");

    return { serializedTx };
  },
});

export const submitAgentRevocationTx = action({
  args: {
    agentId: v.id("agents"),
    signedTx: v.string(),
  },
  handler: async (ctx, args): Promise<{ txSignature: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const connection = new Connection(getRpcUrl(), "confirmed");

    // If signedTx is empty, no on-chain tx — just do DB revocation
    if (!args.signedTx) {
      await ctx.runMutation(
        internal.internals.agentHelpers.revokeAgentInternal,
        { agentId: args.agentId },
      );

      const agent = await ctx.runQuery(
        internal.internals.agentHelpers.getAgentById,
        { agentId: args.agentId },
      );
      if (agent) {
        await ctx.runMutation(internal.internals.agentHelpers.logActivity, {
          workspaceId: agent.workspaceId,
          agentId: args.agentId,
          action: "agent_revoked",
        });
      }

      return { txSignature: "" };
    }

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
      const message =
        err instanceof Error ? err.message : "Unknown Solana error";
      throw new Error(`Failed to submit revocation tx: ${message}`);
    }

    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );

    // DB revocation: set status, clear connect code, delete sessions
    await ctx.runMutation(
      internal.internals.agentHelpers.revokeAgentInternal,
      { agentId: args.agentId },
    );

    // Log activity with tx signature
    const agent = await ctx.runQuery(
      internal.internals.agentHelpers.getAgentById,
      { agentId: args.agentId },
    );
    if (agent) {
      await ctx.runMutation(internal.internals.agentHelpers.logActivity, {
        workspaceId: agent.workspaceId,
        agentId: args.agentId,
        action: "agent_revoked_onchain",
        txSignature: signature,
      });
    }

    return { txSignature: signature };
  },
});
