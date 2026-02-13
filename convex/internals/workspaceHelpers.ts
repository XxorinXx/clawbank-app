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

export const storeWorkspace = internalMutation({
  args: {
    name: v.string(),
    multisigAddress: v.string(),
    creatorTokenIdentifier: v.string(),
    network: v.literal("mainnet"),
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
      creatorTokenIdentifier: args.creatorTokenIdentifier,
      network: args.network,
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
