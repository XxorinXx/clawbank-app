"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import * as smartAccount from "@sqds/smart-account";
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
    const settingsPda = new PublicKey(workspace.settingsAddress);

    const settingsAccount = await smartAccount.accounts.Settings.fromAccountAddress(
      connection,
      settingsPda,
    );

    const members: OnchainMember[] = settingsAccount.signers.map(
      (s: smartAccount.types.SmartAccountSigner) => ({
        pubkey: s.key.toBase58(),
        permissions: {
          initiate: (s.permissions.mask & smartAccount.types.Permission.Initiate) !== 0,
          vote: (s.permissions.mask & smartAccount.types.Permission.Vote) !== 0,
          execute: (s.permissions.mask & smartAccount.types.Permission.Execute) !== 0,
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
