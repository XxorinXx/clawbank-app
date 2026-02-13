import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";

export const getCachedMetadata = internalQuery({
  args: { mints: v.array(v.string()) },
  handler: async (ctx, args): Promise<Doc<"token_metadata_cache">[]> => {
    const results: Doc<"token_metadata_cache">[] = [];
    for (const mint of args.mints) {
      const entry = await ctx.db
        .query("token_metadata_cache")
        .withIndex("by_mint", (q) => q.eq("mint", mint))
        .unique();
      if (entry) results.push(entry);
    }
    return results;
  },
});

export const getCachedPrices = internalQuery({
  args: { mints: v.array(v.string()) },
  handler: async (ctx, args): Promise<Doc<"token_price_cache">[]> => {
    const results: Doc<"token_price_cache">[] = [];
    for (const mint of args.mints) {
      const entry = await ctx.db
        .query("token_price_cache")
        .withIndex("by_mint", (q) => q.eq("mint", mint))
        .unique();
      if (entry) results.push(entry);
    }
    return results;
  },
});

export const upsertTokenMetadata = internalMutation({
  args: {
    entries: v.array(
      v.object({
        mint: v.string(),
        symbol: v.string(),
        name: v.string(),
        icon: v.optional(v.string()),
        decimals: v.number(),
      }),
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = Date.now();
    for (const entry of args.entries) {
      const existing = await ctx.db
        .query("token_metadata_cache")
        .withIndex("by_mint", (q) => q.eq("mint", entry.mint))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          symbol: entry.symbol,
          name: entry.name,
          icon: entry.icon,
          decimals: entry.decimals,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("token_metadata_cache", {
          mint: entry.mint,
          symbol: entry.symbol,
          name: entry.name,
          icon: entry.icon,
          decimals: entry.decimals,
          updatedAt: now,
        });
      }
    }
  },
});

export const upsertTokenPrices = internalMutation({
  args: {
    entries: v.array(
      v.object({
        mint: v.string(),
        priceUsd: v.number(),
      }),
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = Date.now();
    for (const entry of args.entries) {
      const existing = await ctx.db
        .query("token_price_cache")
        .withIndex("by_mint", (q) => q.eq("mint", entry.mint))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          priceUsd: entry.priceUsd,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("token_price_cache", {
          mint: entry.mint,
          priceUsd: entry.priceUsd,
          updatedAt: now,
        });
      }
    }
  },
});
