import { useAction } from "convex/react";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import type { WorkspaceBalance } from "~/types/api";
import { queryKeys } from "~/types/api";

function workspaceBalanceOptions(
  getWorkspaceBalance: ReturnType<typeof useAction<typeof api.actions.getWorkspaceBalance.getWorkspaceBalance>>,
  workspaceId: Id<"workspaces"> | null,
) {
  return queryOptions({
    queryKey: queryKeys.workspaceBalance(workspaceId),
    queryFn: async (): Promise<WorkspaceBalance> => {
      if (!workspaceId) throw new Error("No workspace ID");
      return await getWorkspaceBalance({ workspaceId });
    },
    enabled: !!workspaceId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchInterval: 60_000,
    retry: 2,
  });
}

export function useWorkspaceBalance(workspaceId: Id<"workspaces"> | null) {
  const getWorkspaceBalance = useAction(
    api.actions.getWorkspaceBalance.getWorkspaceBalance,
  );

  return useQuery(workspaceBalanceOptions(getWorkspaceBalance, workspaceId));
}
