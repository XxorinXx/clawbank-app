"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

interface TokenPrice {
  mint: string;
  priceUsd: number;
}

export const getTokenPrices = action({
  args: { mints: v.array(v.string()) },
  handler: async (ctx, args): Promise<TokenPrice[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    return await ctx.runAction(
      internal.actions.fetchTokenPrices.fetchTokenPrices,
      { mints: args.mints },
    );
  },
});
