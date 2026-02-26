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
import { getSponsorKey, getRpcUrl } from "../env";
import { extractErrorMessage, NATIVE_SOL_MINT } from "../lib/turnkeyHelpers";
import { lamportsToSol } from "../lib/spendingLimitPolicy";

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
    const settingsPda = new PublicKey(workspace.settingsAddress);
    const sponsorKeypair = Keypair.fromSecretKey(getSponsorKey());
    const userWallet = new PublicKey(user.walletAddress);

    const approveIx = smartAccount.instructions.approveProposal({
      settingsPda,
      transactionIndex: BigInt(request.proposalIndex),
      signer: userWallet,
    });

    const executeResult = await smartAccount.instructions.executeTransaction({
      connection,
      settingsPda,
      transactionIndex: BigInt(request.proposalIndex),
      signer: userWallet,
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
      throw new Error(`Failed to approve transfer on-chain: ${extractErrorMessage(err, "Unknown Solana error")}`);
    }

    try {
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
    } catch (err: unknown) {
      throw new Error(
        `Transfer approval transaction failed to confirm: ${extractErrorMessage(err, "Unknown confirmation error")}`,
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

    // Load request + SOL price to log activity
    const [request, approvalSolPrices] = await Promise.all([
      ctx.runQuery(
        internal.internals.transferHelpers.getTransferRequest,
        { requestId: args.requestId },
      ),
      ctx.runAction(
        internal.actions.fetchTokenPrices.fetchTokenPrices,
        { mints: [NATIVE_SOL_MINT] },
      ),
    ]);
    if (request) {
      const solPrice = approvalSolPrices[0]?.priceUsd ?? 0;
      const usdValue = lamportsToSol(request.amountLamports) * solPrice;
      await ctx.runMutation(internal.internals.agentHelpers.logActivity, {
        workspaceId: request.workspaceId,
        agentId: request.agentId,
        actorType: "human",
        actorLabel: identity.email ?? "Unknown",
        category: "transaction",
        action: "transfer_approved",
        txSignature: signature,
        amount: request.amountLamports,
        metadata: { recipient: request.recipient, usdValue },
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
    const settingsPda = new PublicKey(workspace.settingsAddress);
    const sponsorKeypair = Keypair.fromSecretKey(getSponsorKey());
    const userWallet = new PublicKey(user.walletAddress);

    const rejectIx = smartAccount.instructions.rejectProposal({
      settingsPda,
      transactionIndex: BigInt(request.proposalIndex),
      signer: userWallet,
    });

    const { blockhash } = await connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
      payerKey: sponsorKeypair.publicKey,
      recentBlockhash: blockhash,
      instructions: [rejectIx],
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
      throw new Error(`Failed to deny transfer on-chain: ${extractErrorMessage(err, "Unknown Solana error")}`);
    }

    try {
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
    } catch (err: unknown) {
      throw new Error(
        `Transfer denial transaction failed to confirm: ${extractErrorMessage(err, "Unknown confirmation error")}`,
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

    // Load request + SOL price to log activity
    const [requestForDeny, denySolPrices] = await Promise.all([
      ctx.runQuery(
        internal.internals.transferHelpers.getTransferRequest,
        { requestId: args.requestId },
      ),
      ctx.runAction(
        internal.actions.fetchTokenPrices.fetchTokenPrices,
        { mints: [NATIVE_SOL_MINT] },
      ),
    ]);
    if (requestForDeny) {
      const solPrice = denySolPrices[0]?.priceUsd ?? 0;
      const usdValue = lamportsToSol(requestForDeny.amountLamports) * solPrice;
      await ctx.runMutation(internal.internals.agentHelpers.logActivity, {
        workspaceId: requestForDeny.workspaceId,
        agentId: requestForDeny.agentId,
        actorType: "human",
        actorLabel: identity.email ?? "Unknown",
        category: "transaction",
        action: "transfer_denied",
        txSignature: signature,
        amount: requestForDeny.amountLamports,
        metadata: { recipient: requestForDeny.recipient, usdValue },
      });
    }

    return { txSignature: signature };
  },
});
