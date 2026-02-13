import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";

export const getLastCreationTime = internalQuery({
  args: { creatorTokenIdentifier: v.string() },
  handler: async (ctx, args): Promise<number | null> => {
    const workspaces = await ctx.db
      .query("workspaces")
      .withIndex("by_creator", (q) =>
        q.eq("creatorTokenIdentifier", args.creatorTokenIdentifier),
      )
      .order("desc")
      .take(1);

    if (workspaces.length === 0) return null;
    return workspaces[0].createdAt;
  },
});

export const getUserByToken = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args): Promise<Doc<"users"> | null> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", args.tokenIdentifier),
      )
      .unique();
    return user;
  },
});

export const getWorkspaceById = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args): Promise<Doc<"workspaces"> | null> => {
    return await ctx.db.get(args.workspaceId);
  },
});

export const storeWorkspace = internalMutation({
  args: {
    name: v.string(),
    multisigAddress: v.string(),
    vaultAddress: v.string(),
    creatorTokenIdentifier: v.string(),
    createdAt: v.number(),
    members: v.array(
      v.object({
        walletAddress: v.string(),
        role: v.union(v.literal("creator"), v.literal("member")),
      }),
    ),
    invites: v.array(
      v.object({
        email: v.string(),
      }),
    ),
  },
  handler: async (ctx, args): Promise<Id<"workspaces">> => {
    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.name,
      multisigAddress: args.multisigAddress,
      vaultAddress: args.vaultAddress,
      creatorTokenIdentifier: args.creatorTokenIdentifier,
      createdAt: args.createdAt,
    });

    for (const member of args.members) {
      await ctx.db.insert("workspace_members", {
        workspaceId,
        walletAddress: member.walletAddress,
        role: member.role,
        addedAt: args.createdAt,
      });
    }

    for (const invite of args.invites) {
      await ctx.db.insert("workspace_invites", {
        workspaceId,
        email: invite.email,
        status: "pending",
        invitedAt: args.createdAt,
      });
    }

    return workspaceId;
  },
});

export const reconcileMembersFromOnchain = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    onchainMembers: v.array(
      v.object({
        walletAddress: v.string(),
        role: v.union(v.literal("creator"), v.literal("member")),
      }),
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    const dbMembers = await ctx.db
      .query("workspace_members")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .collect();

    const dbWallets = new Set(dbMembers.map((m) => m.walletAddress));
    const onchainWallets = new Set(
      args.onchainMembers.map((m) => m.walletAddress),
    );

    // Add members that exist on-chain but not in DB
    for (const onchain of args.onchainMembers) {
      if (!dbWallets.has(onchain.walletAddress)) {
        await ctx.db.insert("workspace_members", {
          workspaceId: args.workspaceId,
          walletAddress: onchain.walletAddress,
          role: onchain.role,
          addedAt: Date.now(),
        });
      }
    }

    // Remove DB members that no longer exist on-chain
    for (const dbMember of dbMembers) {
      if (!onchainWallets.has(dbMember.walletAddress)) {
        await ctx.db.delete(dbMember._id);
      }
    }
  },
});
