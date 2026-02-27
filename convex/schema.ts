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
    settingsAddress: v.string(),
    vaultAddress: v.string(),
    creatorTokenIdentifier: v.string(),
    createdAt: v.number(),
  })
    .index("by_creator", ["creatorTokenIdentifier"])
    .index("by_settings", ["settingsAddress"]),

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

  token_metadata_cache: defineTable({
    mint: v.string(),
    symbol: v.string(),
    name: v.string(),
    icon: v.optional(v.string()),
    decimals: v.number(),
    updatedAt: v.number(),
  }).index("by_mint", ["mint"]),

  token_price_cache: defineTable({
    mint: v.string(),
    priceUsd: v.number(),
    updatedAt: v.number(),
  }).index("by_mint", ["mint"]),

  agents: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    turnkeyWalletId: v.optional(v.string()),
    publicKey: v.optional(v.string()),
    status: v.union(
      v.literal("provisioning"),
      v.literal("connected"),
      v.literal("active"),
      v.literal("paused"),
      v.literal("revoked"),
    ),
    connectCode: v.optional(v.string()),
    connectCodeExpiresAt: v.optional(v.number()),
    authPublicKey: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_publicKey", ["publicKey"]),

  agent_sessions: defineTable({
    agentId: v.id("agents"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    lastUsedAt: v.number(),
    sessionType: v.union(
      v.literal("connect_code"),
      v.literal("session"),
      v.literal("access"),
      v.literal("refresh"),
    ),
    authVersion: v.optional(v.union(v.literal("v1"), v.literal("v2"))),
    refreshTokenFamily: v.optional(v.string()),
    refreshSequence: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_agentId", ["agentId"])
    .index("by_refreshFamily", ["refreshTokenFamily"]),

  spending_limits: defineTable({
    workspaceId: v.id("workspaces"),
    agentId: v.id("agents"),
    tokenMint: v.string(),
    limitAmount: v.number(),
    spentAmount: v.number(),
    periodType: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
    ),
    periodStart: v.number(),
    onchainCreateKey: v.optional(v.string()),
  })
    .index("by_agent_token", ["agentId", "tokenMint"])
    .index("by_workspace", ["workspaceId"]),

  transfer_requests: defineTable({
    agentId: v.id("agents"),
    workspaceId: v.id("workspaces"),
    recipient: v.string(),
    amountLamports: v.number(),
    shortNote: v.string(),
    description: v.string(),
    status: v.union(
      v.literal("pending_execution"),
      v.literal("executed"),
      v.literal("pending_approval"),
      v.literal("approved"),
      v.literal("denied"),
      v.literal("failed"),
    ),
    spendingLimitSnapshot: v.object({
      limitAmount: v.number(),
      spentAmount: v.number(),
      periodType: v.string(),
    }),
    txSignature: v.optional(v.string()),
    proposalAddress: v.optional(v.string()),
    proposalIndex: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_agent", ["agentId"]),

  activity_log: defineTable({
    workspaceId: v.id("workspaces"),
    agentId: v.optional(v.id("agents")),
    actorType: v.optional(v.union(v.literal("agent"), v.literal("human"))),
    actorLabel: v.optional(v.string()),
    category: v.optional(
      v.union(
        v.literal("transaction"),
        v.literal("config"),
        v.literal("agent_lifecycle"),
      ),
    ),
    action: v.string(),
    txSignature: v.optional(v.string()),
    amount: v.optional(v.number()),
    tokenMint: v.optional(v.string()),
    metadata: v.optional(v.any()),
    timestamp: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_agent", ["agentId"])
    .index("by_txSignature", ["txSignature"]),

  dpop_nonces: defineTable({
    jti: v.string(),
    agentId: v.id("agents"),
    expiresAt: v.number(),
  })
    .index("by_jti", ["jti"])
    .index("by_expiresAt", ["expiresAt"]),

  agent_rate_limits: defineTable({
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_key", ["key"]),
});
