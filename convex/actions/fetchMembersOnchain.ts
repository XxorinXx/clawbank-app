"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import * as multisig from "@sqds/multisig";
import { Connection, PublicKey } from "@solana/web3.js";
import { getRpcUrl } from "../env";

interface OnchainMember {
  pubkey: string;
  permissions: {
    initiate: boolean;
    vote: boolean;
    execute: boolean;
  };
}

export const fetchMembersOnchain = action({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args): Promise<OnchainMember[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const workspace = await ctx.runQuery(
      internal.internals.workspaceHelpers.getWorkspaceById,
      { workspaceId: args.workspaceId },
    );
    if (!workspace) {
      throw new Error("Workspace not found");
    }

    const connection = new Connection(getRpcUrl(), "confirmed");
    const multisigPda = new PublicKey(workspace.settingsAddress);

    const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
      connection,
      multisigPda,
    );

    const members: OnchainMember[] = multisigAccount.members.map(
      (m: multisig.types.Member) => ({
        pubkey: m.key.toBase58(),
        permissions: {
          initiate: (m.permissions.mask & multisig.types.Permission.Initiate) !== 0,
          vote: (m.permissions.mask & multisig.types.Permission.Vote) !== 0,
          execute: (m.permissions.mask & multisig.types.Permission.Execute) !== 0,
        },
      }),
    );

    // Trigger reconciliation in the background
    await ctx.runMutation(
      internal.internals.workspaceHelpers.reconcileMembersFromOnchain,
      {
        workspaceId: args.workspaceId,
        onchainMembers: members.map((m) => ({
          walletAddress: m.pubkey,
          role: "member" as const,
        })),
      },
    );

    return members;
  },
});
