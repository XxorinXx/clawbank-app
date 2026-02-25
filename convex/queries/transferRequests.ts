import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireWorkspaceMember } from "../internals/workspaceHelpers";

export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId);

    const requests = await ctx.db
      .query("transfer_requests")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .collect();

    // Enrich with agent names
    const results = [];
    for (const req of requests) {
      const agent = await ctx.db.get(req.agentId);
      results.push({
        ...req,
        agentName: agent?.name ?? "Unknown Agent",
      });
    }
    return results;
  },
});

const PENDING_STATUSES = ["pending_approval", "pending_execution"] as const;

export const listPending = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId);

    const allRequests = await ctx.db
      .query("transfer_requests")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .collect();

    const pending = allRequests.filter((r) =>
      (PENDING_STATUSES as readonly string[]).includes(r.status),
    );

    const results = [];
    for (const req of pending) {
      const agent = await ctx.db.get(req.agentId);

      // Fetch live spending limit for this agent
      const spendingLimit = await ctx.db
        .query("spending_limits")
        .withIndex("by_agent_token", (q) => q.eq("agentId", req.agentId))
        .first();

      results.push({
        ...req,
        agentName: agent?.name ?? "Unknown Agent",
        liveSpendingLimit: spendingLimit
          ? {
              limitAmount: spendingLimit.limitAmount,
              spentAmount: spendingLimit.spentAmount,
              periodType: spendingLimit.periodType,
              periodStart: spendingLimit.periodStart,
            }
          : null,
      });
    }
    return results;
  },
});

export const pendingCount = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId);

    const allRequests = await ctx.db
      .query("transfer_requests")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    return allRequests.filter((r) =>
      (PENDING_STATUSES as readonly string[]).includes(r.status),
    ).length;
  },
});
