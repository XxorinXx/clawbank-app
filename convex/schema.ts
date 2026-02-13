import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    walletAddress: v.string(),
    createdAt: v.number(),
    tokenIdentifier: v.string(),
  }).index("by_token", ["tokenIdentifier"]),

  workspaces: defineTable({
    name: v.string(),
    multisigAddress: v.string(),
    creatorTokenIdentifier: v.string(),
    network: v.literal("mainnet"),
    createdAt: v.number(),
  })
    .index("by_creator", ["creatorTokenIdentifier"])
    .index("by_multisig", ["multisigAddress"]),

  workspace_members: defineTable({
    workspaceId: v.id("workspaces"),
    walletAddress: v.string(),
    role: v.union(v.literal("creator"), v.literal("member")),
    addedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_wallet", ["walletAddress"]),

  workspace_invites: defineTable({
    workspaceId: v.id("workspaces"),
    email: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("rejected"),
    ),
    invitedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_email", ["email"]),
});
