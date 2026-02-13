import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const getOrCreateUser = mutation({
  args: {
    email: v.string(),
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (existing) {
      return existing._id;
    }

    const userId = await ctx.db.insert("users", {
      email: args.email,
      walletAddress: args.walletAddress,
      createdAt: Date.now(),
      tokenIdentifier: identity.tokenIdentifier,
    });

    return userId;
  },
});
