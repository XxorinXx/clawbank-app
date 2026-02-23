"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import * as multisig from "@sqds/multisig";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { getSponsorKey, getRpcUrl } from "../env";

// ---------------------------------------------------------------------------
// buildApproveTransferRequest
// ---------------------------------------------------------------------------

export const buildApproveTransferRequest = action({
  args: { requestId: v.id("transfer_requests") },
  handler: async (
    ctx,
    args,
  ): Promise<{ serializedTx: string; requestId: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.runQuery(
      internal.internals.workspaceHelpers.getUserByToken,
      { tokenIdentifier: identity.tokenIdentifier },
    );
    if (!user) throw new Error("User not found");

    const request = await ctx.runQuery(
      internal.internals.transferHelpers.getTransferRequest,
      { requestId: args.requestId },
    );
    if (!request) throw new Error("Transfer request not found");
    if (request.status !== "pending_approval") {
      throw new Error(
        `Cannot approve request with status "${request.status}"`,
      );
    }
    if (request.proposalIndex === undefined) {
      throw new Error("Transfer request has no proposal index");
    }

    const workspace = await ctx.runQuery(
      internal.internals.workspaceHelpers.getWorkspaceById,
      { workspaceId: request.workspaceId },
    );
    if (!workspace) throw new Error("Workspace not found");

    const connection = new Connection(getRpcUrl(), "confirmed");
    const multisigPda = new PublicKey(workspace.multisigAddress);
    const sponsorKeypair = Keypair.fromSecretKey(getSponsorKey());
    const userWallet = new PublicKey(user.walletAddress);

    const approveIx = multisig.instructions.proposalApprove({
      multisigPda,
      transactionIndex: BigInt(request.proposalIndex),
      member: userWallet,
    });

    const executeResult = await multisig.instructions.vaultTransactionExecute({
      connection,
      multisigPda,
      transactionIndex: BigInt(request.proposalIndex),
      member: userWallet,
    });

    const { blockhash } = await connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
      payerKey: sponsorKeypair.publicKey,
      recentBlockhash: blockhash,
      instructions: [approveIx, executeResult.instruction],
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([sponsorKeypair]);

    const serializedTx = Buffer.from(tx.serialize()).toString("base64");

    return { serializedTx, requestId: args.requestId };
  },
});

// ---------------------------------------------------------------------------
// submitTransferApproval
// ---------------------------------------------------------------------------

export const submitTransferApproval = action({
  args: {
    requestId: v.id("transfer_requests"),
    signedTx: v.string(),
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
      const message =
        err instanceof Error ? err.message : "Unknown Solana error";
      throw new Error(`Failed to approve transfer on-chain: ${message}`);
    }

    try {
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown confirmation error";
      throw new Error(
        `Transfer approval transaction failed to confirm: ${message}`,
      );
    }

    // On-chain confirmed — update DB
    await ctx.runMutation(
      internal.internals.transferHelpers.updateTransferRequestStatus,
      {
        requestId: args.requestId,
        status: "approved",
        txSignature: signature,
      },
    );

    // Load request to log activity
    const request = await ctx.runQuery(
      internal.internals.transferHelpers.getTransferRequest,
      { requestId: args.requestId },
    );
    if (request) {
      await ctx.runMutation(internal.internals.agentHelpers.logActivity, {
        workspaceId: request.workspaceId,
        agentId: request.agentId,
        action: "transfer_approved",
        txSignature: signature,
        amount: request.amountLamports,
      });
    }

    return { txSignature: signature };
  },
});

// ---------------------------------------------------------------------------
// denyTransferRequest (build tx)
// ---------------------------------------------------------------------------

export const denyTransferRequest = action({
  args: { requestId: v.id("transfer_requests") },
  handler: async (
    ctx,
    args,
  ): Promise<{ serializedTx: string; requestId: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.runQuery(
      internal.internals.workspaceHelpers.getUserByToken,
      { tokenIdentifier: identity.tokenIdentifier },
    );
    if (!user) throw new Error("User not found");

    const request = await ctx.runQuery(
      internal.internals.transferHelpers.getTransferRequest,
      { requestId: args.requestId },
    );
    if (!request) throw new Error("Transfer request not found");
    if (request.status !== "pending_approval") {
      throw new Error(`Cannot deny request with status "${request.status}"`);
    }
    if (request.proposalIndex === undefined) {
      throw new Error("Transfer request has no proposal index");
    }

    const workspace = await ctx.runQuery(
      internal.internals.workspaceHelpers.getWorkspaceById,
      { workspaceId: request.workspaceId },
    );
    if (!workspace) throw new Error("Workspace not found");

    const connection = new Connection(getRpcUrl(), "confirmed");
    const multisigPda = new PublicKey(workspace.multisigAddress);
    const sponsorKeypair = Keypair.fromSecretKey(getSponsorKey());
    const userWallet = new PublicKey(user.walletAddress);

    const cancelIx = multisig.instructions.proposalCancel({
      multisigPda,
      transactionIndex: BigInt(request.proposalIndex),
      member: userWallet,
    });

    const { blockhash } = await connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
      payerKey: sponsorKeypair.publicKey,
      recentBlockhash: blockhash,
      instructions: [cancelIx],
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([sponsorKeypair]);

    const serializedTx = Buffer.from(tx.serialize()).toString("base64");

    return { serializedTx, requestId: args.requestId };
  },
});

// ---------------------------------------------------------------------------
// submitTransferDenial
// ---------------------------------------------------------------------------

export const submitTransferDenial = action({
  args: {
    requestId: v.id("transfer_requests"),
    signedTx: v.string(),
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
      const message =
        err instanceof Error ? err.message : "Unknown Solana error";
      throw new Error(`Failed to deny transfer on-chain: ${message}`);
    }

    try {
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown confirmation error";
      throw new Error(
        `Transfer denial transaction failed to confirm: ${message}`,
      );
    }

    // On-chain confirmed — update DB
    await ctx.runMutation(
      internal.internals.transferHelpers.updateTransferRequestStatus,
      {
        requestId: args.requestId,
        status: "denied",
        txSignature: signature,
      },
    );

    // Load request to log activity
    const request = await ctx.runQuery(
      internal.internals.transferHelpers.getTransferRequest,
      { requestId: args.requestId },
    );
    if (request) {
      await ctx.runMutation(internal.internals.agentHelpers.logActivity, {
        workspaceId: request.workspaceId,
        agentId: request.agentId,
        action: "transfer_denied",
        txSignature: signature,
        amount: request.amountLamports,
      });
    }

    return { txSignature: signature };
  },
});
