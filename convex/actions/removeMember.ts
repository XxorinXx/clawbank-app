"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import * as multisig from "@sqds/multisig";
import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { getSponsorKey, getRpcUrl } from "../env";

export const removeMember = action({
  args: {
    workspaceId: v.id("workspaces"),
    memberPublicKey: v.string(),
  },
  handler: async (ctx, args): Promise<{ status: "executed" | "proposal_created" }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    // Look up user's wallet
    const user = await ctx.runQuery(
      internal.internals.workspaceHelpers.getUserByToken,
      { tokenIdentifier: identity.tokenIdentifier },
    );
    if (!user) {
      throw new Error("User not found");
    }

    // Cannot remove yourself
    if (user.walletAddress === args.memberPublicKey) {
      throw new Error("Cannot remove yourself from the workspace");
    }

    // Look up workspace
    const workspace = await ctx.runQuery(
      internal.internals.workspaceHelpers.getWorkspaceById,
      { workspaceId: args.workspaceId },
    );
    if (!workspace) {
      throw new Error("Workspace not found");
    }

    const connection = new Connection(getRpcUrl(), "confirmed");
    const multisigPda = new PublicKey(workspace.multisigAddress);
    const memberToRemove = new PublicKey(args.memberPublicKey);
    const sponsorKeypair = Keypair.fromSecretKey(getSponsorKey());
    const creatorKey = new PublicKey(user.walletAddress);

    // Read multisig to get current state
    const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
      connection,
      multisigPda,
    );

    // Verify member exists on-chain
    const memberExists = multisigAccount.members.some(
      (m: multisig.types.Member) => m.key.toBase58() === args.memberPublicKey,
    );
    if (!memberExists) {
      throw new Error("Member not found in on-chain multisig");
    }

    // Cannot remove last member
    if (multisigAccount.members.length <= 1) {
      throw new Error("Cannot remove the last member of the workspace");
    }

    const currentTransactionIndex = Number(multisigAccount.transactionIndex);
    const newTransactionIndex = BigInt(currentTransactionIndex + 1);

    // Build the config transaction instruction to remove the member
    const removeIx = multisig.instructions.configTransactionCreate({
      multisigPda,
      transactionIndex: newTransactionIndex,
      creator: creatorKey,
      actions: [{
        __kind: "RemoveMember",
        oldMember: memberToRemove,
      }],
    });

    // Build the proposal create instruction
    const proposalIx = multisig.instructions.proposalCreate({
      multisigPda,
      transactionIndex: newTransactionIndex,
      creator: creatorKey,
    });

    // Build approve instruction (auto-approve since threshold=1 in v1)
    const approveIx = multisig.instructions.proposalApprove({
      multisigPda,
      transactionIndex: newTransactionIndex,
      member: creatorKey,
    });

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();

    // Build versioned transaction with all three instructions
    const messageV0 = new TransactionMessage({
      payerKey: sponsorKeypair.publicKey,
      recentBlockhash: blockhash,
      instructions: [removeIx, proposalIx, approveIx],
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([sponsorKeypair]);

    let signature: string;
    try {
      signature = await connection.sendTransaction(tx, { skipPreflight: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown Solana error";
      throw new Error(`Failed to create member removal proposal: ${message}`);
    }

    try {
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown confirmation error";
      throw new Error(`Member removal proposal failed to confirm: ${message}`);
    }

    // Reconcile DB: remove the member
    await ctx.runMutation(
      internal.internals.workspaceHelpers.reconcileMembersFromOnchain,
      {
        workspaceId: args.workspaceId,
        onchainMembers: multisigAccount.members
          .filter((m: multisig.types.Member) => m.key.toBase58() !== args.memberPublicKey)
          .map((m: multisig.types.Member) => ({
            walletAddress: m.key.toBase58(),
            role: "member" as const,
          })),
      },
    );

    // With threshold=1, the proposal auto-executes
    const threshold = multisigAccount.threshold;
    return { status: threshold <= 1 ? "executed" : "proposal_created" };
  },
});
