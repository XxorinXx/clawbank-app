import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../convex/_generated/api";

interface TokenMetadata {
  mint: string;
  symbol: string;
  name: string;
  icon?: string;
  decimals: number;
}

export function useTokenMetadata(mints: string[]) {
  const fetchMetadata = useAction(
    api.actions.getTokenMetadata.getTokenMetadata,
  );

  return useQuery<Map<string, TokenMetadata>>({
    queryKey: ["tokenMetadata", mints.sort().join(",")],
    queryFn: async () => {
      if (mints.length === 0) return new Map();
      const results = await fetchMetadata({ mints });
      const map = new Map<string, TokenMetadata>();
      for (const r of results) {
        map.set(r.mint, r);
      }
      return map;
    },
    enabled: mints.length > 0,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours (matches backend TTL)
  });
}
