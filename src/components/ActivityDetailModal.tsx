import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  Bot,
  ChevronDown,
  Copy,
  Check,
  ExternalLink,
  Settings,
  User,
  X,
} from "lucide-react";
import { cn } from "~/utils/cn";
import {
  activityTitle,
  activityDescription,
  formatRelativeTime,
  formatFullDateTime,
  formatUsd,
  lamportsToSol,
  truncateAddress,
} from "~/utils/format";
import {
  StatusBadge,
  ACTIVITY_STATUS_STYLES,
  ACTIVITY_STATUS_LABELS,
} from "~/components/ui/StatusBadge";

export interface ActivityLogEntry {
  _id: string;
  workspaceId: string;
  agentId?: string;
  action: string;
  actorType?: "agent" | "human";
  actorLabel?: string;
  category?: "transaction" | "config" | "agent_lifecycle";
  txSignature?: string;
  amount?: number;
  tokenMint?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

interface ActivityDetailModalProps {
  activity: ActivityLogEntry | null;
  isOpen: boolean;
  onClose: () => void;
}

const springTransition = {
  type: "spring" as const,
  stiffness: 350,
  damping: 28,
};

function CategoryIcon({
  category,
  size = 20,
}: {
  category?: string;
  size?: number;
}) {
  switch (category) {
    case "transaction":
      return <ArrowUpRight size={size} />;
    case "config":
      return <Settings size={size} />;
    case "agent_lifecycle":
      return <Bot size={size} />;
    default:
      return <ArrowUpRight size={size} />;
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="cursor-pointer rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
      aria-label="Copy to clipboard"
    >
      {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
    </button>
  );
}

function statusFromAction(action: string): string {
  if (action.includes("failed")) return "failed";
  if (action.includes("denied")) return "denied";
  if (action.includes("proposal_created") || action.includes("pending"))
    return "pending";
  return "success";
}

export function ActivityDetailModal({
  activity,
  isOpen,
  onClose,
}: ActivityDetailModalProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Reset details disclosure when modal opens for a new activity
  useEffect(() => {
    if (isOpen) setDetailsOpen(false);
  }, [isOpen, activity?._id]);

  return (
    <AnimatePresence>
      {isOpen && activity && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/30 backdrop-blur-xl"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/50 bg-white/75 shadow-[0_8px_32px_rgba(0,0,0,0.12)] ring-1 ring-inset ring-white/60 backdrop-blur-2xl"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={springTransition}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute right-3 top-3 cursor-pointer rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close"
            >
              <X size={16} />
            </button>

            <div className="p-6">
              {/* Header */}
              <div className="mb-6 flex items-start gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    activity.category === "transaction"
                      ? "bg-blue-50 text-blue-600"
                      : activity.category === "config"
                        ? "bg-purple-50 text-purple-600"
                        : "bg-gray-100 text-gray-600",
                  )}
                >
                  <CategoryIcon category={activity.category} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-gray-900">
                    {activityTitle(activity.action, activity.metadata)}
                  </h3>
                  <StatusBadge
                    status={statusFromAction(activity.action)}
                    styles={ACTIVITY_STATUS_STYLES}
                    labels={ACTIVITY_STATUS_LABELS}
                  />
                </div>
              </div>

              {/* Actor */}
              {activity.actorLabel && (
                <div className="mb-4">
                  <span className="mb-1 block text-xs font-medium text-gray-400">
                    Actor
                  </span>
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full",
                        activity.actorType === "agent"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-gray-100 text-gray-600",
                      )}
                    >
                      {activity.actorType === "agent" ? (
                        <Bot size={12} />
                      ) : (
                        <User size={12} />
                      )}
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {activity.actorLabel}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                      {activity.actorType === "agent" ? "Agent" : "Human"}
                    </span>
                  </div>
                </div>
              )}

              {/* Timestamp */}
              <div className="mb-4">
                <span className="mb-1 block text-xs font-medium text-gray-400">
                  Timestamp
                </span>
                <span className="text-sm text-gray-900">
                  {formatFullDateTime(activity.timestamp)}
                </span>
                <span className="ml-2 text-xs text-gray-400">
                  {formatRelativeTime(activity.timestamp)}
                </span>
              </div>

              {/* Description */}
              {activityDescription(activity.action, activity.metadata) && (
                <div className="mb-4">
                  <span className="mb-1 block text-xs font-medium text-gray-400">
                    Description
                  </span>
                  <p className="text-sm text-gray-700">
                    {activityDescription(activity.action, activity.metadata)}
                  </p>
                </div>
              )}

              {/* Amount (for transactions) */}
              {activity.amount != null && activity.amount > 0 && (
                <div className="mb-4">
                  <span className="mb-1 block text-xs font-medium text-gray-400">
                    Amount
                  </span>
                  <div className="flex items-baseline gap-2">
                    {typeof activity.metadata?.usdValue === "number" && (
                      <span className="text-lg font-semibold text-gray-900">
                        {formatUsd(activity.metadata.usdValue)}
                      </span>
                    )}
                    <span className={cn(
                      typeof activity.metadata?.usdValue === "number"
                        ? "text-sm text-gray-400"
                        : "text-lg font-semibold text-gray-900",
                    )}>
                      {lamportsToSol(activity.amount)} SOL
                    </span>
                  </div>
                </div>
              )}

              {/* Config change details */}
              {activity.category === "config" &&
                typeof activity.metadata?.description === "string" && (
                <div className="mb-4">
                  <span className="mb-1 block text-xs font-medium text-gray-400">
                    Change
                  </span>
                  <p className="text-sm text-gray-700">
                    {activity.metadata.description}
                  </p>
                </div>
              )}

              {/* Technical Details disclosure */}
              {(activity.txSignature ||
                typeof activity.metadata?.proposalAddress === "string" ||
                typeof activity.metadata?.errorMessage === "string") && (
                <div className="border-t border-gray-100 pt-4">
                  <button
                    onClick={() => setDetailsOpen((prev) => !prev)}
                    className="flex w-full cursor-pointer items-center gap-1 text-xs font-medium text-gray-400 transition-colors hover:text-gray-600"
                  >
                    Technical Details
                    <motion.span
                      animate={{ rotate: detailsOpen ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown size={14} />
                    </motion.span>
                  </button>

                  <AnimatePresence>
                    {detailsOpen && (
                      <motion.div
                        className="mt-3 space-y-2 overflow-hidden"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        {activity.txSignature && (
                          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                            <div>
                              <span className="block text-[11px] font-medium text-gray-400">
                                Tx Signature
                              </span>
                              <span className="text-xs font-mono text-gray-700">
                                {truncateAddress(activity.txSignature, 8)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <CopyButton text={activity.txSignature} />
                              <a
                                href={`https://solscan.io/tx/${activity.txSignature}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-blue-600"
                                aria-label="View on Solscan"
                              >
                                <ExternalLink size={14} />
                              </a>
                            </div>
                          </div>
                        )}

                        {typeof activity.metadata?.proposalAddress === "string" && (
                          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                            <div>
                              <span className="block text-[11px] font-medium text-gray-400">
                                Proposal
                              </span>
                              <span className="text-xs font-mono text-gray-700">
                                {truncateAddress(
                                  activity.metadata.proposalAddress,
                                  8,
                                )}
                              </span>
                            </div>
                            <CopyButton
                              text={activity.metadata.proposalAddress}
                            />
                          </div>
                        )}

                        {typeof activity.metadata?.errorMessage === "string" && (
                          <div className="rounded-lg bg-red-50 px-3 py-2">
                            <span className="block text-[11px] font-medium text-red-400">
                              Error
                            </span>
                            <span className="text-xs text-red-700">
                              {activity.metadata.errorMessage}
                            </span>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
