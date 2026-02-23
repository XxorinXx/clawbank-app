"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

export const getTokenMetadata = action({
  args: { mints: v.array(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    return await ctx.runAction(
      internal.actions.fetchTokenMetadata.fetchTokenMetadata,
      { mints: args.mints },
    );
  },
});
