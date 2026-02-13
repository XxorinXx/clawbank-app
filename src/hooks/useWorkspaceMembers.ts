import { useQuery as useConvexQuery } from "convex/react";
import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

interface OnchainMember {
  pubkey: string;
  permissions: {
    initiate: boolean;
    vote: boolean;
    execute: boolean;
  };
}

interface MergedMember {
  walletAddress: string;
  role: "creator" | "member";
  permissions: {
    initiate: boolean;
    vote: boolean;
    execute: boolean;
  } | null;
  addedAt: number;
}

export function useWorkspaceMembers(workspaceId: Id<"workspaces"> | null) {
  const dbData = useConvexQuery(
    api.queries.getWorkspaceMembers.getWorkspaceMembers,
    workspaceId ? { workspaceId } : "skip",
  );

  const fetchOnchain = useAction(
    api.actions.fetchMembersOnchain.fetchMembersOnchain,
  );

  const onchainQuery = useQuery<OnchainMember[]>({
    queryKey: ["membersOnchain", workspaceId],
    queryFn: async () => {
      if (!workspaceId) throw new Error("No workspace ID");
      return await fetchOnchain({ workspaceId });
    },
    enabled: !!workspaceId,
    staleTime: 30_000,
    refetchInterval: 120_000,
    retry: 1,
  });

  // Merge DB members with on-chain data
  const members: MergedMember[] = [];

  if (dbData?.members) {
    const onchainMap = new Map<string, OnchainMember>();
    if (onchainQuery.data) {
      for (const m of onchainQuery.data) {
        onchainMap.set(m.pubkey, m);
      }
    }

    for (const dbMember of dbData.members) {
      const onchain = onchainMap.get(dbMember.walletAddress);
      members.push({
        walletAddress: dbMember.walletAddress,
        role: dbMember.role,
        permissions: onchain?.permissions ?? null,
        addedAt: dbMember.addedAt,
      });
    }

    // Add on-chain members not yet in DB
    if (onchainQuery.data) {
      const dbWallets = new Set(dbData.members.map((m) => m.walletAddress));
      for (const onchain of onchainQuery.data) {
        if (!dbWallets.has(onchain.pubkey)) {
          members.push({
            walletAddress: onchain.pubkey,
            role: "member",
            permissions: onchain.permissions,
            addedAt: Date.now(),
          });
        }
      }
    }
  }

  return {
    members,
    invites: dbData?.invites ?? [],
    isLoading: dbData === undefined,
    isSyncing: onchainQuery.isLoading || onchainQuery.isFetching,
    onchainError: onchainQuery.error,
  };
}
