"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

const PRICE_TTL_MS = 60 * 1000; // 60 seconds

interface TokenPrice {
  mint: string;
  priceUsd: number;
}

export const fetchTokenPrices = internalAction({
  args: { mints: v.array(v.string()) },
  handler: async (ctx, args): Promise<TokenPrice[]> => {
    if (args.mints.length === 0) return [];

    // Check cache first
    const cached = await ctx.runQuery(
      internal.internals.cacheHelpers.getCachedPrices,
      { mints: args.mints },
    );

    const now = Date.now();
    const cachedMap = new Map<string, TokenPrice>();
    const staleOrMissing: string[] = [];

    for (const entry of cached) {
      if (now - entry.updatedAt < PRICE_TTL_MS) {
        cachedMap.set(entry.mint, {
          mint: entry.mint,
          priceUsd: entry.priceUsd,
        });
      } else {
        staleOrMissing.push(entry.mint);
      }
    }

    // Find mints not in cache at all
    for (const mint of args.mints) {
      if (!cachedMap.has(mint) && !staleOrMissing.includes(mint)) {
        staleOrMissing.push(mint);
      }
    }

    // Fetch missing from Jupiter Price API (batch all in one request)
    if (staleOrMissing.length > 0) {
      const fetched = await fetchPricesFromJupiter(staleOrMissing);

      // Upsert into cache
      if (fetched.length > 0) {
        await ctx.runMutation(
          internal.internals.cacheHelpers.upsertTokenPrices,
          {
            entries: fetched.map((f) => ({
              mint: f.mint,
              priceUsd: f.priceUsd,
            })),
          },
        );
      }

      for (const f of fetched) {
        cachedMap.set(f.mint, f);
      }

      // Fill zero price for mints Jupiter didn't return
      for (const mint of staleOrMissing) {
        if (!cachedMap.has(mint)) {
          cachedMap.set(mint, { mint, priceUsd: 0 });

          await ctx.runMutation(
            internal.internals.cacheHelpers.upsertTokenPrices,
            { entries: [{ mint, priceUsd: 0 }] },
          );
        }
      }
    }

    return args.mints.map((mint) => cachedMap.get(mint)!);
  },
});

async function fetchPricesFromJupiter(mints: string[]): Promise<TokenPrice[]> {
  try {
    const ids = mints.join(",");
    const res = await fetch(`https://api.jup.ag/price/v2?ids=${ids}`);
    if (!res.ok) return [];

    const data = await res.json();
    const prices: Record<string, { price?: string }> = data?.data ?? {};
    const results: TokenPrice[] = [];

    for (const mint of mints) {
      const entry = prices[mint];
      if (entry?.price) {
        results.push({
          mint,
          priceUsd: parseFloat(entry.price),
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}
