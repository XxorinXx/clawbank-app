import { useAction } from "convex/react";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { api } from "../../convex/_generated/api";
import { queryKeys } from "~/types/api";

function tokenPricesOptions(
  fetchPrices: ReturnType<typeof useAction<typeof api.actions.getTokenPrices.getTokenPrices>>,
  mints: readonly string[],
) {
  return queryOptions({
    queryKey: queryKeys.tokenPrices(mints),
    queryFn: async () => {
      if (mints.length === 0) return [];
      return await fetchPrices({ mints: [...mints] });
    },
    enabled: mints.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchInterval: 60_000,
    select: (results): Map<string, number> => {
      const map = new Map<string, number>();
      for (const r of results) {
        map.set(r.mint, r.priceUsd);
      }
      return map;
    },
  });
}

export function useTokenPrices(mints: readonly string[]) {
  const fetchPrices = useAction(
    api.actions.getTokenPrices.getTokenPrices,
  );

  return useQuery(tokenPricesOptions(fetchPrices, mints));
}
