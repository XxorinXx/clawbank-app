import { useAction } from "convex/react";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { api } from "../../convex/_generated/api";
import type { TokenMetadata } from "~/types/api";
import { queryKeys } from "~/types/api";

function tokenMetadataOptions(
  fetchMetadata: ReturnType<typeof useAction<typeof api.actions.getTokenMetadata.getTokenMetadata>>,
  mints: readonly string[],
) {
  return queryOptions({
    queryKey: queryKeys.tokenMetadata(mints),
    queryFn: async () => {
      if (mints.length === 0) return [];
      return await fetchMetadata({ mints: [...mints] });
    },
    enabled: mints.length > 0,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    select: (results): Map<string, TokenMetadata> => {
      const map = new Map<string, TokenMetadata>();
      for (const r of results) {
        map.set(r.mint, r);
      }
      return map;
    },
  });
}

export function useTokenMetadata(mints: readonly string[]) {
  const fetchMetadata = useAction(
    api.actions.getTokenMetadata.getTokenMetadata,
  );

  return useQuery(tokenMetadataOptions(fetchMetadata, mints));
}
