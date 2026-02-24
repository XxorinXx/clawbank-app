import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const checkAndStoreNonce = internalMutation({
  args: { jti: v.string(), agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dpop_nonces")
      .withIndex("by_jti", (q) => q.eq("jti", args.jti))
      .unique();
    if (existing) throw new Error("Replay detected: duplicate jti");
    await ctx.db.insert("dpop_nonces", {
      jti: args.jti,
      agentId: args.agentId,
      expiresAt: Date.now() + 60_000,
    });
  },
});

export const cleanupExpiredNonces = internalMutation({
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("dpop_nonces")
      .withIndex("by_expiresAt")
      .filter((q) => q.lt(q.field("expiresAt"), Date.now()))
      .collect();
    for (const nonce of expired) {
      await ctx.db.delete(nonce._id);
    }
  },
});

export const revokeAllAgentSessions = internalMutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("agent_sessions")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .collect();
    for (const s of sessions) {
      await ctx.db.delete(s._id);
    }
  },
});
