"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import * as smartAccount from "@sqds/smart-account";
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
    const multisigPda = new PublicKey(workspace.settingsAddress);
    const memberToRemove = new PublicKey(args.memberPublicKey);
    const sponsorKeypair = Keypair.fromSecretKey(getSponsorKey());
    const userWallet = new PublicKey(user.walletAddress);

    // Read smart account settings to get current state
    const settingsAccount =
      await smartAccount.accounts.Settings.fromAccountAddress(
        connection,
        multisigPda,
      );

    // Verify member exists on-chain
    const memberExists = settingsAccount.signers.some(
      (s: smartAccount.types.SmartAccountSigner) =>
        s.key.toBase58() === args.memberPublicKey,
    );
    if (!memberExists) {
      throw new Error("Member not found in on-chain smart account");
    }

    // Cannot remove last member
    if (settingsAccount.signers.length <= 1) {
      throw new Error("Cannot remove the last member of the workspace");
    }

    const { blockhash } = await connection.getLatestBlockhash();

    const { tx } = buildRemoveMemberTxCore({
      userWallet,
      sponsorPublicKey: sponsorKeypair.publicKey,
      settingsPda: multisigPda,
      memberToRemove,
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

    const multisigPda = new PublicKey(workspace.settingsAddress);

    // Read the updated on-chain smart account state
    const settingsAccount =
      await smartAccount.accounts.Settings.fromAccountAddress(
        connection,
        multisigPda,
      );

    await ctx.runMutation(
      internal.internals.workspaceHelpers.reconcileMembersFromOnchain,
      {
        workspaceId: args.workspaceId,
        onchainMembers: settingsAccount.signers.map(
          (s: smartAccount.types.SmartAccountSigner) => ({
            walletAddress: s.key.toBase58(),
            role: "member" as const,
          }),
        ),
      },
    );

    // Log member removal activity
    await ctx.runMutation(internal.internals.agentHelpers.logActivity, {
      workspaceId: args.workspaceId,
      actorType: "human",
      actorLabel: identity.email ?? "Unknown",
      category: "config",
      action: "member_removed",
      txSignature: signature,
      metadata: { memberPublicKey: args.memberPublicKey },
    });

    return { txSignature: signature };
  },
});
