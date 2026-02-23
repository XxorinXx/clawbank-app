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
import { buildRemoveMemberTxCore } from "../lib/txBuilders";
import { extractErrorMessage } from "../lib/turnkeyHelpers";

export const buildRemoveMemberTx = action({
  args: {
    workspaceId: v.id("workspaces"),
    memberPublicKey: v.string(),
  },
  handler: async (ctx, args): Promise<{ serializedTx: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    // Look up user's wallet
    const user = await ctx.runQuery(
      internal.internals.workspaceHelpers.getUserByToken,
      { tokenIdentifier: identity.tokenIdentifier },
    );
    if (!user) throw new Error("User not found");

    // Cannot remove yourself
    if (user.walletAddress === args.memberPublicKey) {
      throw new Error("Cannot remove yourself from the workspace");
    }

    const workspace = await ctx.runQuery(
      internal.internals.workspaceHelpers.getWorkspaceById,
      { workspaceId: args.workspaceId },
    );
    if (!workspace) throw new Error("Workspace not found");

    const connection = new Connection(getRpcUrl(), "confirmed");
    const multisigPda = new PublicKey(workspace.multisigAddress);
    const memberToRemove = new PublicKey(args.memberPublicKey);
    const sponsorKeypair = Keypair.fromSecretKey(getSponsorKey());
    const userWallet = new PublicKey(user.walletAddress);

    // Read multisig to get current state
    const multisigAccount =
      await multisig.accounts.Multisig.fromAccountAddress(
        connection,
        multisigPda,
      );

    // Verify member exists on-chain
    const memberExists = multisigAccount.members.some(
      (m: multisig.types.Member) =>
        m.key.toBase58() === args.memberPublicKey,
    );
    if (!memberExists) {
      throw new Error("Member not found in on-chain multisig");
    }

    // Cannot remove last member
    if (multisigAccount.members.length <= 1) {
      throw new Error("Cannot remove the last member of the workspace");
    }

    const currentTransactionIndex = Number(multisigAccount.transactionIndex);
    const { blockhash } = await connection.getLatestBlockhash();

    const { tx } = buildRemoveMemberTxCore({
      userWallet,
      sponsorPublicKey: sponsorKeypair.publicKey,
      multisigPda,
      memberToRemove,
      currentTransactionIndex,
      blockhash,
    });

    // Partial-sign with sponsor (fee payer) — user signs on frontend
    tx.sign([sponsorKeypair]);

    const serializedTx = Buffer.from(tx.serialize()).toString("base64");

    return { serializedTx };
  },
});

export const submitRemoveMemberTx = action({
  args: {
    workspaceId: v.id("workspaces"),
    memberPublicKey: v.string(),
    signedTx: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ txSignature: string }> => {
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
      throw new Error(`Failed to submit member removal tx: ${extractErrorMessage(err, "Unknown Solana error")}`);
    }

    try {
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
    } catch (err: unknown) {
      throw new Error(
        `Member removal transaction failed to confirm: ${extractErrorMessage(err, "Unknown confirmation error")}`,
      );
    }

    // On-chain confirmed — now reconcile DB
    const workspace = await ctx.runQuery(
      internal.internals.workspaceHelpers.getWorkspaceById,
      { workspaceId: args.workspaceId },
    );
    if (!workspace) throw new Error("Workspace not found");

    const multisigPda = new PublicKey(workspace.multisigAddress);

    // Read the updated on-chain multisig state
    const multisigAccount =
      await multisig.accounts.Multisig.fromAccountAddress(
        connection,
        multisigPda,
      );

    await ctx.runMutation(
      internal.internals.workspaceHelpers.reconcileMembersFromOnchain,
      {
        workspaceId: args.workspaceId,
        onchainMembers: multisigAccount.members.map(
          (m: multisig.types.Member) => ({
            walletAddress: m.key.toBase58(),
            role: "member" as const,
          }),
        ),
      },
    );

    return { txSignature: signature };
  },
});
