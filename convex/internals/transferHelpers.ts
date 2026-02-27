import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";

export const createTransferRequest = internalMutation({
  args: {
    agentId: v.id("agents"),
    workspaceId: v.id("workspaces"),
    recipient: v.string(),
    amountLamports: v.number(),
    shortNote: v.string(),
    description: v.string(),
    status: v.union(
      v.literal("pending_execution"),
      v.literal("pending_approval"),
    ),
    spendingLimitSnapshot: v.object({
      limitAmount: v.number(),
      spentAmount: v.number(),
      periodType: v.string(),
    }),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("transfer_requests", {
      agentId: args.agentId,
      workspaceId: args.workspaceId,
      recipient: args.recipient,
      amountLamports: args.amountLamports,
      shortNote: args.shortNote,
      description: args.description,
      status: args.status,
      spendingLimitSnapshot: args.spendingLimitSnapshot,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateTransferRequestStatus = internalMutation({
  args: {
    requestId: v.id("transfer_requests"),
    status: v.union(
      v.literal("pending_execution"),
      v.literal("executed"),
      v.literal("pending_approval"),
      v.literal("approved"),
      v.literal("denied"),
      v.literal("failed"),
    ),
    txSignature: v.optional(v.string()),
    proposalAddress: v.optional(v.string()),
    proposalIndex: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.txSignature !== undefined) patch.txSignature = args.txSignature;
    if (args.proposalAddress !== undefined) patch.proposalAddress = args.proposalAddress;
    if (args.proposalIndex !== undefined) patch.proposalIndex = args.proposalIndex;
    if (args.errorMessage !== undefined) patch.errorMessage = args.errorMessage;
    await ctx.db.patch(args.requestId, patch);
  },
});

export const getTransferRequest = internalQuery({
  args: { requestId: v.id("transfer_requests") },
  handler: async (ctx, args): Promise<Doc<"transfer_requests"> | null> => {
    return await ctx.db.get(args.requestId);
  },
});

export const cancelPendingRequestsByAgent = internalMutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const requests = await ctx.db
      .query("transfer_requests")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .collect();
    const now = Date.now();
    for (const req of requests) {
      if (req.status === "pending_approval" || req.status === "pending_execution") {
        await ctx.db.patch(req._id, { status: "denied", updatedAt: now });
      }
    }
  },
});

export const updateSpentAmount = internalMutation({
  args: {
    agentId: v.id("agents"),
    tokenMint: v.string(),
    additionalSpent: v.number(),
  },
  handler: async (ctx, args) => {
    const limit = await ctx.db
      .query("spending_limits")
      .withIndex("by_agent_token", (q) =>
        q.eq("agentId", args.agentId).eq("tokenMint", args.tokenMint),
      )
      .unique();
    if (!limit) {
      throw new Error("Spending limit not found");
    }
    await ctx.db.patch(limit._id, {
      spentAmount: limit.spentAmount + args.additionalSpent,
    });
  },
});
