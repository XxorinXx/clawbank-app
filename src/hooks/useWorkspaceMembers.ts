import { useQuery as useConvexQuery } from "convex/react";
import { useAction } from "convex/react";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useMemo } from "react";
import type { OnchainMember, MergedMember } from "~/types/api";
import { queryKeys } from "~/types/api";

interface WorkspaceMembersResult {
  readonly members: readonly MergedMember[];
  readonly invites: ReadonlyArray<{ email: string; invitedAt: number }>;
  readonly isLoading: boolean;
  readonly isSyncing: boolean;
  readonly onchainError: Error | null;
}

function membersOnchainOptions(
  fetchOnchain: ReturnType<typeof useAction<typeof api.actions.fetchMembersOnchain.fetchMembersOnchain>>,
  workspaceId: Id<"workspaces"> | null,
) {
  return queryOptions({
    queryKey: queryKeys.membersOnchain(workspaceId),
    queryFn: async (): Promise<OnchainMember[]> => {
      if (!workspaceId) throw new Error("No workspace ID");
      return await fetchOnchain({ workspaceId });
    },
    enabled: !!workspaceId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });
}

export function useWorkspaceMembers(
  workspaceId: Id<"workspaces"> | null,
): WorkspaceMembersResult {
  const dbData = useConvexQuery(
    api.queries.getWorkspaceMembers.getWorkspaceMembers,
    workspaceId ? { workspaceId } : "skip",
  );

  const agents = useConvexQuery(
    api.queries.agents.list,
    workspaceId ? { workspaceId } : "skip",
  );

  const agentPubkeys = useMemo(() => {
    if (!agents) return new Set<string>();
    return new Set(
      agents.map((a: { publicKey?: string }) => a.publicKey).filter(Boolean) as string[],
    );
  }, [agents]);

  const fetchOnchain = useAction(
    api.actions.fetchMembersOnchain.fetchMembersOnchain,
  );

  const onchainQuery = useQuery(
    membersOnchainOptions(fetchOnchain, workspaceId),
  );

  const members = useMemo((): MergedMember[] => {
    if (!dbData?.members) return [];

    const onchainMap = new Map<string, OnchainMember>();
    if (onchainQuery.data) {
      for (const m of onchainQuery.data) {
        onchainMap.set(m.pubkey, m);
      }
    }

    const merged: MergedMember[] = [];

    for (const dbMember of dbData.members) {
      const onchain = onchainMap.get(dbMember.walletAddress);
      merged.push({
        walletAddress: dbMember.walletAddress,
        role: dbMember.role,
        permissions: onchain?.permissions ?? null,
        addedAt: dbMember.addedAt,
      });
    }

    // Add on-chain members not yet in DB
    if (onchainQuery.data) {
      const dbWallets = new Set(
        dbData.members.map(
          (m: { walletAddress: string }) => m.walletAddress,
        ),
      );
      for (const onchain of onchainQuery.data) {
        if (!dbWallets.has(onchain.pubkey)) {
          merged.push({
            walletAddress: onchain.pubkey,
            role: "member",
            permissions: onchain.permissions,
            addedAt: Date.now(),
          });
        }
      }
    }

    return merged;
  }, [dbData?.members, onchainQuery.data]);

  const humanMembers = useMemo(
    () => members.filter((m) => !agentPubkeys.has(m.walletAddress)),
    [members, agentPubkeys],
  );

  return {
    members: humanMembers,
    invites: dbData?.invites ?? [],
    isLoading: dbData === undefined,
    isSyncing: onchainQuery.isLoading || onchainQuery.isFetching,
    onchainError: onchainQuery.error,
  };
}
