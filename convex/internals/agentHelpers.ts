import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";

export const getAgentById = internalQuery({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args): Promise<Doc<"agents"> | null> => {
    return await ctx.db.get(args.agentId);
  },
});

export const updateAgentProvision = internalMutation({
  args: {
    agentId: v.id("agents"),
    turnkeyWalletId: v.string(),
    publicKey: v.string(),
    connectCode: v.string(),
    connectCodeExpiresAt: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.agentId, {
      turnkeyWalletId: args.turnkeyWalletId,
      publicKey: args.publicKey,
      connectCode: args.connectCode,
      connectCodeExpiresAt: args.connectCodeExpiresAt,
    });
  },
});

export const insertAgentSession = internalMutation({
  args: {
    agentId: v.id("agents"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    sessionType: v.union(v.literal("connect_code"), v.literal("session")),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.insert("agent_sessions", {
      agentId: args.agentId,
      tokenHash: args.tokenHash,
      expiresAt: args.expiresAt,
      lastUsedAt: Date.now(),
      sessionType: args.sessionType,
    });
  },
});

export const logActivity = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    agentId: v.id("agents"),
    action: v.string(),
    txSignature: v.optional(v.string()),
    amount: v.optional(v.number()),
    tokenMint: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.insert("activity_log", {
      workspaceId: args.workspaceId,
      agentId: args.agentId,
      action: args.action,
      txSignature: args.txSignature,
      amount: args.amount,
      tokenMint: args.tokenMint,
      metadata: args.metadata,
      timestamp: Date.now(),
    });
  },
});

export const getSessionByHash = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args): Promise<Doc<"agent_sessions"> | null> => {
    return await ctx.db
      .query("agent_sessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
  },
});

export const deleteSession = internalMutation({
  args: { sessionId: v.id("agent_sessions") },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.delete(args.sessionId);
  },
});

export const updateSessionLastUsed = internalMutation({
  args: { sessionId: v.id("agent_sessions") },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.sessionId, { lastUsedAt: Date.now() });
  },
});

export const updateAgentStatus = internalMutation({
  args: {
    agentId: v.id("agents"),
    status: v.union(
      v.literal("provisioning"),
      v.literal("connected"),
      v.literal("active"),
      v.literal("paused"),
      v.literal("revoked"),
    ),
    clearConnectCode: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<void> => {
    const patch: Record<string, unknown> = { status: args.status };
    if (args.clearConnectCode) {
      patch.connectCode = undefined;
      patch.connectCodeExpiresAt = undefined;
    }
    await ctx.db.patch(args.agentId, patch);
  },
});

export const deleteConnectCodeSessions = internalMutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args): Promise<void> => {
    const sessions = await ctx.db
      .query("agent_sessions")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .filter((q) => q.eq(q.field("sessionType"), "connect_code"))
      .collect();
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }
  },
});

export const updateAgentConnectCode = internalMutation({
  args: {
    agentId: v.id("agents"),
    connectCode: v.string(),
    connectCodeExpiresAt: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.agentId, {
      connectCode: args.connectCode,
      connectCodeExpiresAt: args.connectCodeExpiresAt,
    });
  },
});

export const getSpendingLimitsByAgent = internalQuery({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args): Promise<Doc<"spending_limits">[]> => {
    return await ctx.db
      .query("spending_limits")
      .withIndex("by_agent_token", (q) => q.eq("agentId", args.agentId))
      .collect();
  },
});

export const getTokenMetadata = internalQuery({
  args: { mint: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("token_metadata_cache")
      .withIndex("by_mint", (q) => q.eq("mint", args.mint))
      .unique();
  },
});

export const revokeAgentInternal = internalMutation({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args): Promise<void> => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Agent not found");

    // Set status to revoked, clear connect code
    await ctx.db.patch(args.agentId, {
      status: "revoked",
      connectCode: undefined,
      connectCodeExpiresAt: undefined,
    });

    // Delete all agent_sessions for this agent
    const sessions = await ctx.db
      .query("agent_sessions")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .collect();
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }
  },
});

export const updateSpendingLimitRecord = internalMutation({
  args: {
    agentId: v.id("agents"),
    workspaceId: v.id("workspaces"),
    tokenMint: v.string(),
    limitAmount: v.number(),
    periodType: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
    ),
    onchainCreateKey: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const existingLimits = await ctx.db
      .query("spending_limits")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .filter((q) => q.eq(q.field("agentId"), args.agentId))
      .collect();

    const existingLimit = existingLimits[0];

    if (existingLimit && existingLimit.tokenMint === args.tokenMint) {
      // Same token — update amount, period, and on-chain key
      await ctx.db.patch(existingLimit._id, {
        limitAmount: args.limitAmount,
        periodType: args.periodType,
        onchainCreateKey: args.onchainCreateKey,
      });
    } else {
      // Token changed or no existing limit — delete old, insert new
      if (existingLimit) {
        await ctx.db.delete(existingLimit._id);
      }
      await ctx.db.insert("spending_limits", {
        workspaceId: args.workspaceId,
        agentId: args.agentId,
        tokenMint: args.tokenMint,
        limitAmount: args.limitAmount,
        spentAmount: 0,
        periodType: args.periodType,
        periodStart: Date.now(),
        onchainCreateKey: args.onchainCreateKey,
      });
    }

    // Log activity
    await ctx.db.insert("activity_log", {
      workspaceId: args.workspaceId,
      agentId: args.agentId,
      action: "limit_updated",
      timestamp: Date.now(),
    });
  },
});

export const updateSpendingLimitOnchainKey = internalMutation({
  args: {
    agentId: v.id("agents"),
    workspaceId: v.id("workspaces"),
    onchainCreateKey: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const limits = await ctx.db
      .query("spending_limits")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .filter((q) => q.eq(q.field("agentId"), args.agentId))
      .collect();
    const limit = limits[0];
    if (limit) {
      await ctx.db.patch(limit._id, {
        onchainCreateKey: args.onchainCreateKey,
      });
    }
  },
});
