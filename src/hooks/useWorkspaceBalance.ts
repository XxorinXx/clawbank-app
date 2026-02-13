import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

interface TokenBalanceInfo {
  mint: string;
  symbol: string;
  name: string;
  icon: string | null;
  amount: string;
  usdValue: number;
}

interface WorkspaceBalance {
  totalUsd: number;
  tokens: TokenBalanceInfo[];
}

export function useWorkspaceBalance(workspaceId: Id<"workspaces"> | null) {
  const getWorkspaceBalance = useAction(
    api.actions.getWorkspaceBalance.getWorkspaceBalance,
  );

  return useQuery<WorkspaceBalance>({
    queryKey: ["workspaceBalance", workspaceId],
    queryFn: async () => {
      if (!workspaceId) throw new Error("No workspace ID");
      return await getWorkspaceBalance({ workspaceId });
    },
    enabled: !!workspaceId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
