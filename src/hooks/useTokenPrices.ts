import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../convex/_generated/api";

export function useTokenPrices(mints: string[]) {
  const fetchPrices = useAction(
    api.actions.getTokenPrices.getTokenPrices,
  );

  return useQuery<Map<string, number>>({
    queryKey: ["tokenPrices", mints.sort().join(",")],
    queryFn: async () => {
      if (mints.length === 0) return new Map();
      const results = await fetchPrices({ mints });
      const map = new Map<string, number>();
      for (const r of results) {
        map.set(r.mint, r.priceUsd);
      }
      return map;
    },
    enabled: mints.length > 0,
    staleTime: 60_000, // 60s (matches backend TTL)
    refetchInterval: 60_000,
  });
}
