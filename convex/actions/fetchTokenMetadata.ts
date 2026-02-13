"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { getJupiterApiKey } from "../env";

const METADATA_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface TokenMetadata {
  mint: string;
  symbol: string;
  name: string;
  icon?: string;
  decimals: number;
}

export const fetchTokenMetadata = internalAction({
  args: { mints: v.array(v.string()) },
  handler: async (ctx, args): Promise<TokenMetadata[]> => {
    if (args.mints.length === 0) return [];

    // Check cache first
    const cached = await ctx.runQuery(
      internal.internals.cacheHelpers.getCachedMetadata,
      { mints: args.mints },
    );

    const now = Date.now();
    const cachedMap = new Map<string, TokenMetadata>();
    const staleOrMissing: string[] = [];

    for (const entry of cached) {
      // Re-fetch if stale OR if previously stored as UNKNOWN (failed fetch)
      if (now - entry.updatedAt < METADATA_TTL_MS && entry.symbol !== "UNKNOWN") {
        cachedMap.set(entry.mint, {
          mint: entry.mint,
          symbol: entry.symbol,
          name: entry.name,
          icon: entry.icon ?? undefined,
          decimals: entry.decimals,
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

    // Fetch missing from Jupiter API
    if (staleOrMissing.length > 0) {
      const fetched = await fetchFromJupiter(staleOrMissing);

      // Upsert into cache
      if (fetched.length > 0) {
        await ctx.runMutation(
          internal.internals.cacheHelpers.upsertTokenMetadata,
          {
            entries: fetched.map((f) => ({
              mint: f.mint,
              symbol: f.symbol,
              name: f.name,
              icon: f.icon,
              decimals: f.decimals,
            })),
          },
        );
      }

      for (const f of fetched) {
        cachedMap.set(f.mint, f);
      }

      // Fill in unknowns for mints Jupiter didn't return
      for (const mint of staleOrMissing) {
        if (!cachedMap.has(mint)) {
          const unknown: TokenMetadata = {
            mint,
            symbol: "UNKNOWN",
            name: "Unknown Token",
            decimals: 0,
          };
          cachedMap.set(mint, unknown);

          await ctx.runMutation(
            internal.internals.cacheHelpers.upsertTokenMetadata,
            { entries: [{ mint, symbol: "UNKNOWN", name: "Unknown Token", decimals: 0 }] },
          );
        }
      }
    }

    return args.mints.map((mint) => cachedMap.get(mint)!);
  },
});

async function fetchFromJupiter(mints: string[]): Promise<TokenMetadata[]> {
  const apiKey = getJupiterApiKey();
  const results: TokenMetadata[] = [];

  // Jupiter search API handles one token at a time, batch sequentially
  for (const mint of mints) {
    try {
      const url = `https://api.jup.ag/tokens/v2/search?query=${mint}`;
      const res = await fetch(url, {
        headers: { "x-api-key": apiKey },
      });
      if (!res.ok) continue;

      const data = await res.json();
      const tokens = Array.isArray(data) ? data : [];
      const match = tokens.find(
        (t: { id?: string }) => t.id === mint,
      );

      if (match) {
        results.push({
          mint,
          symbol: match.symbol ?? "UNKNOWN",
          name: match.name ?? "Unknown Token",
          icon: match.icon ?? undefined,
          decimals: typeof match.decimals === "number" ? match.decimals : 0,
        });
      }
    } catch {
      // Skip failed fetches, will be stored as UNKNOWN
    }
  }

  return results;
}
