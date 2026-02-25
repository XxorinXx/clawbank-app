import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "convex/react";
import {
  Activity,
  ArrowUpRight,
  Bot,
  Settings,
  User,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { ListSkeleton } from "~/components/ui/ListSkeleton";
import { EmptyState } from "~/components/ui/EmptyState";
import {
  ActivityDetailModal,
  type ActivityLogEntry,
} from "~/components/ActivityDetailModal";
import { cn } from "~/utils/cn";
import {
  activityTitle,
  activityDescription,
  formatRelativeTime,
  formatFullDateTime,
  formatUsd,
  lamportsToSol,
} from "~/utils/format";

interface ActivityTabProps {
  workspaceId: Id<"workspaces">;
}

type CategoryFilter = "all" | "transaction" | "config" | "agent_lifecycle";

const FILTER_PILLS: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "transaction", label: "Transfers" },
  { key: "config", label: "Config" },
  { key: "agent_lifecycle", label: "Agents" },
];

function ActivityIcon({ action, category }: { action: string; category?: string }) {
  const size = 16;
  if (category === "agent_lifecycle" || action.startsWith("agent_") || action === "provision_failed") {
    return <Bot size={size} />;
  }
  if (action === "member_added") return <UserPlus size={size} />;
  if (action === "member_removed") return <UserMinus size={size} />;
  if (category === "config" || action.includes("spending_limit") || action === "workspace_created") {
    return <Settings size={size} />;
  }
  return <ArrowUpRight size={size} />;
}

function iconBg(category?: string): string {
  switch (category) {
    case "transaction":
      return "bg-blue-50 text-blue-600";
    case "config":
      return "bg-purple-50 text-purple-600";
    case "agent_lifecycle":
      return "bg-gray-100 text-gray-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

export function ActivityTab({ workspaceId }: ActivityTabProps) {
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [selectedActivity, setSelectedActivity] =
    useState<ActivityLogEntry | null>(null);

  const queryArgs =
    filter === "all"
      ? { workspaceId, paginationOpts: { numItems: 20, cursor: null } }
      : { workspaceId, category: filter, paginationOpts: { numItems: 20, cursor: null } };

  const result = useQuery(api.queries.activityLog.list, queryArgs);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const [loadMore, setLoadMore] = useState(false);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLoadMore(true);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Handle pagination (load next page when sentinel is visible)
  const nextCursor = result?.continueCursor;
  const isDone = result?.isDone ?? true;
  const [pages, setPages] = useState<ActivityLogEntry[][]>([]);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);

  // Fetch additional pages
  const additionalPage = useQuery(
    api.queries.activityLog.list,
    currentCursor
      ? filter === "all"
        ? { workspaceId, paginationOpts: { numItems: 20, cursor: currentCursor } }
        : { workspaceId, category: filter, paginationOpts: { numItems: 20, cursor: currentCursor } }
      : "skip",
  );

  // Accumulate pages
  useEffect(() => {
    if (additionalPage?.page && currentCursor) {
      setPages((prev) => [...prev, additionalPage.page as ActivityLogEntry[]]);
      setCurrentCursor(null);
    }
  }, [additionalPage, currentCursor]);

  // Load more when sentinel visible
  useEffect(() => {
    if (loadMore && nextCursor && !isDone && !currentCursor) {
      setCurrentCursor(nextCursor);
      setLoadMore(false);
    }
  }, [loadMore, nextCursor, isDone, currentCursor]);

  // Reset pages when filter changes
  const handleFilterChange = useCallback((newFilter: CategoryFilter) => {
    setFilter(newFilter);
    setPages([]);
    setCurrentCursor(null);
  }, []);

  if (result === undefined) {
    return <ListSkeleton rows={4} />;
  }

  const firstPage = (result.page ?? []) as ActivityLogEntry[];
  const allActivities = [...firstPage, ...pages.flat()];

  if (allActivities.length === 0) {
    return (
      <div>
        {/* Filter pills */}
        <div className="mb-4 flex gap-1.5">
          {FILTER_PILLS.map((pill) => (
            <button
              key={pill.key}
              onClick={() => handleFilterChange(pill.key)}
              className={cn(
                "cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors",
                filter === pill.key
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              )}
            >
              {pill.label}
            </button>
          ))}
        </div>
        <EmptyState
          icon={<Activity size={28} className="text-gray-400" />}
          title="No activity yet"
          description="Actions in this vault will appear here."
        />
      </div>
    );
  }

  return (
    <div>
      {/* Filter pills */}
      <div className="mb-4 flex gap-1.5">
        {FILTER_PILLS.map((pill) => (
          <button
            key={pill.key}
            onClick={() => handleFilterChange(pill.key)}
            className={cn(
              "cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filter === pill.key
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200",
            )}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Activity list */}
      <div className="flex flex-col gap-2">
        {allActivities.map((entry) => {
          const description = activityDescription(entry.action, entry.metadata);

          return (
            <div
              key={entry._id}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-100 px-3 py-3 transition-colors hover:bg-gray-50"
              onClick={() => setSelectedActivity(entry)}
            >
              {/* Icon */}
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  iconBg(entry.category),
                )}
              >
                <ActivityIcon action={entry.action} category={entry.category} />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">
                    {activityTitle(entry.action, entry.metadata)}
                  </span>
                  <span
                    className="text-[11px] text-gray-400"
                    title={formatFullDateTime(entry.timestamp)}
                  >
                    {formatRelativeTime(entry.timestamp)}
                  </span>
                </div>

                {description && (
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {description}
                  </p>
                )}

                <div className="mt-1 flex items-center gap-2">
                  {/* Actor pill */}
                  {entry.actorLabel && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        entry.actorType === "agent"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-gray-100 text-gray-500",
                      )}
                    >
                      {entry.actorType === "agent" ? (
                        <Bot size={10} />
                      ) : (
                        <User size={10} />
                      )}
                      {entry.actorLabel}
                    </span>
                  )}
                </div>
              </div>

              {/* Amount (right side, for transactions) */}
              {entry.amount != null && entry.amount > 0 && (
                <div className="shrink-0 text-right">
                  {typeof entry.metadata?.usdValue === "number" && (
                    <span className="text-sm font-semibold text-gray-900">
                      {formatUsd(entry.metadata.usdValue)}
                    </span>
                  )}
                  <span className={cn(
                    "block text-[11px]",
                    typeof entry.metadata?.usdValue === "number"
                      ? "text-gray-400"
                      : "text-sm font-semibold text-gray-900",
                  )}>
                    {lamportsToSol(entry.amount)} SOL
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Infinite scroll sentinel */}
      {!isDone && <div ref={sentinelRef} className="h-8" />}
      {currentCursor && <ListSkeleton rows={2} />}

      {/* Detail modal */}
      <ActivityDetailModal
        activity={selectedActivity}
        isOpen={selectedActivity !== null}
        onClose={() => setSelectedActivity(null)}
      />
    </div>
  );
}
