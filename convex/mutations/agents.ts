import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    budget: v.object({
      tokenMint: v.string(),
      limitAmount: v.number(),
      periodType: v.union(
        v.literal("daily"),
        v.literal("weekly"),
        v.literal("monthly"),
      ),
    }),
  },
  handler: async (ctx, args): Promise<{ agentId: Id<"agents"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    // Validate name
    const name = args.name.trim();
    if (name.length === 0) {
      throw new Error("Agent name cannot be empty");
    }
    if (name.length > 32) {
      throw new Error("Agent name must be 32 characters or fewer");
    }

    // Validate budget amount
    if (args.budget.limitAmount <= 0) {
      throw new Error("Budget limit must be greater than zero");
    }

    // Verify caller is a workspace member
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) {
      throw new Error("User not found");
    }

    const membership = await ctx.db
      .query("workspace_members")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .filter((q) => q.eq(q.field("walletAddress"), user.walletAddress))
      .unique();
    if (!membership) {
      throw new Error("Not a member of this workspace");
    }

    // Check agent name uniqueness within workspace
    const existingAgent = await ctx.db
      .query("agents")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .filter((q) => q.eq(q.field("name"), name))
      .first();
    if (existingAgent) {
      throw new Error("An agent with this name already exists in the workspace");
    }

    const now = Date.now();

    // Insert agent record
    const agentId = await ctx.db.insert("agents", {
      workspaceId: args.workspaceId,
      name,
      status: "provisioning",
      createdAt: now,
    });

    // Insert spending limit
    await ctx.db.insert("spending_limits", {
      workspaceId: args.workspaceId,
      agentId,
      tokenMint: args.budget.tokenMint,
      limitAmount: args.budget.limitAmount,
      spentAmount: 0,
      periodType: args.budget.periodType,
      periodStart: now,
    });

    // Schedule Turnkey wallet provisioning
    await ctx.scheduler.runAfter(
      0,
      internal.actions.provisionAgent.provisionAgent,
      { agentId },
    );

    return { agentId };
  },
});

export const updateSpendingLimit = mutation({
  args: {
    agentId: v.id("agents"),
    tokenMint: v.string(),
    limitAmount: v.number(),
    periodType: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    if (args.limitAmount <= 0) {
      throw new Error("Budget limit must be greater than zero");
    }

    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Agent not found");

    // Verify caller is a workspace member
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) throw new Error("User not found");

    const membership = await ctx.db
      .query("workspace_members")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", agent.workspaceId),
      )
      .filter((q) => q.eq(q.field("walletAddress"), user.walletAddress))
      .unique();
    if (!membership) throw new Error("Not a member of this workspace");

    // Find existing spending limit for this agent
    const existingLimits = await ctx.db
      .query("spending_limits")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", agent.workspaceId),
      )
      .filter((q) => q.eq(q.field("agentId"), args.agentId))
      .collect();

    const existingLimit = existingLimits[0];
    const oldOnchainCreateKey = existingLimit?.onchainCreateKey;

    if (existingLimit && existingLimit.tokenMint === args.tokenMint) {
      // Same token — update amount and period, keep spentAmount
      await ctx.db.patch(existingLimit._id, {
        limitAmount: args.limitAmount,
        periodType: args.periodType,
      });
    } else {
      // Token changed or no existing limit — delete old, insert new
      if (existingLimit) {
        await ctx.db.delete(existingLimit._id);
      }
      await ctx.db.insert("spending_limits", {
        workspaceId: agent.workspaceId,
        agentId: args.agentId,
        tokenMint: args.tokenMint,
        limitAmount: args.limitAmount,
        spentAmount: 0,
        periodType: args.periodType,
        periodStart: Date.now(),
      });
    }

    // Log activity
    await ctx.db.insert("activity_log", {
      workspaceId: agent.workspaceId,
      agentId: args.agentId,
      action: "limit_updated",
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

export const confirmAgentActivation = mutation({
  args: {
    agentId: v.id("agents"),
    onchainCreateKey: v.string(),
    txSignature: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Agent not found");

    // Store onchainCreateKey on the spending_limits record
    const limits = await ctx.db
      .query("spending_limits")
      .withIndex("by_agent_token", (q) => q.eq("agentId", args.agentId))
      .collect();
    const limit = limits[0];
    if (limit) {
      await ctx.db.patch(limit._id, {
        onchainCreateKey: args.onchainCreateKey,
      });
    }

    // Log activity with tx signature
    await ctx.db.insert("activity_log", {
      workspaceId: agent.workspaceId,
      agentId: args.agentId,
      action: "agent_activated_onchain",
      txSignature: args.txSignature,
      timestamp: Date.now(),
    });

    return { success: true };
  },
});

export const revoke = mutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Agent not found");

    // Revoke: set status, clear connect code
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

    // Log revocation
    await ctx.db.insert("activity_log", {
      workspaceId: agent.workspaceId,
      agentId: args.agentId,
      action: "agent_revoked",
      timestamp: Date.now(),
    });

    return { success: true };
  },
});
