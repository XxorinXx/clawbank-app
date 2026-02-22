import { query } from "../_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";

type SpendingLimitInfo = {
  tokenMint: string;
  tokenSymbol?: string;
  limitAmount: number;
  spentAmount: number;
  periodType: "daily" | "weekly" | "monthly";
  periodStart: number;
};

type AgentWithLimits = {
  _id: Id<"agents">;
  workspaceId: Id<"workspaces">;
  name: string;
  status: Doc<"agents">["status"];
  turnkeyWalletId?: string;
  publicKey?: string;
  connectCode?: string;
  connectCodeExpiresAt?: number;
  createdAt: number;
  limits: SpendingLimitInfo[];
};

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args): Promise<AgentWithLimits[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const agents = await ctx.db
      .query("agents")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .collect();

    const results: AgentWithLimits[] = [];

    for (const agent of agents) {
      const limits = await ctx.db
        .query("spending_limits")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", args.workspaceId),
        )
        .filter((q) => q.eq(q.field("agentId"), agent._id))
        .collect();

      const limitsWithSymbols: SpendingLimitInfo[] = [];
      for (const l of limits) {
        const cached = await ctx.db
          .query("token_metadata_cache")
          .withIndex("by_mint", (q) => q.eq("mint", l.tokenMint))
          .unique();
        limitsWithSymbols.push({
          tokenMint: l.tokenMint,
          tokenSymbol: cached?.symbol,
          limitAmount: l.limitAmount,
          spentAmount: l.spentAmount,
          periodType: l.periodType,
          periodStart: l.periodStart,
        });
      }

      results.push({
        _id: agent._id,
        workspaceId: agent.workspaceId,
        name: agent.name,
        status: agent.status,
        turnkeyWalletId: agent.turnkeyWalletId,
        publicKey: agent.publicKey,
        connectCode: agent.connectCode,
        connectCodeExpiresAt: agent.connectCodeExpiresAt,
        createdAt: agent.createdAt,
        limits: limitsWithSymbols,
      });
    }

    return results;
  },
});

export const getConnectCode = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const agent = await ctx.db.get(args.agentId);
    if (!agent) return null;

    // Return connect code only if it's still valid
    if (!agent.connectCode || !agent.connectCodeExpiresAt) return null;
    if (agent.connectCodeExpiresAt < Date.now()) return null;

    return {
      connectCode: agent.connectCode,
      expiresAt: agent.connectCodeExpiresAt,
    };
  },
});
