"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { getJupiterApiKey } from "../env";

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
  const apiKey = getJupiterApiKey();
  try {
    const ids = mints.join(",");
    const res = await fetch(`https://api.jup.ag/price/v3?ids=${ids}`, {
      headers: { "x-api-key": apiKey },
    });
    if (!res.ok) return [];

    const data = await res.json();
    // v3 response is keyed directly by mint (no .data wrapper), with usdPrice field
    const prices: Record<string, { usdPrice?: number; price?: string }> = data ?? {};
    const results: TokenPrice[] = [];

    for (const mint of mints) {
      const entry = prices[mint];
      const price = entry?.usdPrice ?? (entry?.price ? parseFloat(entry.price) : undefined);
      if (price !== undefined) {
        results.push({ mint, priceUsd: price });
      }
    }

    return results;
  } catch {
    return [];
  }
}
