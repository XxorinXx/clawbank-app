import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  Bot,
  ChevronDown,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "~/utils/cn";
import {
  truncateAddress,
  formatRelativeTime,
  formatFullDateTime,
  formatSol,
  formatLamportsAsUsd,
} from "~/utils/format";
import { getProgramName } from "~/utils/programs";

export interface PendingRequest {
  _id: string;
  agentId: string;
  workspaceId: string;
  recipient: string;
  amountLamports: number;
  shortNote: string;
  description: string;
  status: string;
  spendingLimitSnapshot: {
    limitAmount: number;
    spentAmount: number;
    periodType: string;
  };
  txSignature?: string;
  proposalAddress?: string;
  proposalIndex?: number;
  errorMessage?: string;
  metadata?: {
    type: "execute";
    instructionCount: number;
    programs: string[];
    estimatedValueSol?: number;
  };
  createdAt: number;
  updatedAt: number;
  agentName: string;
  liveSpendingLimit: {
    limitAmount: number;
    spentAmount: number;
    periodType: string;
    periodStart: number;
  } | null;
}

interface RequestDetailModalProps {
  request: PendingRequest | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove: (requestId: string) => void;
  onDeny: (requestId: string) => void;
  processingAction: "approve" | "deny" | null;
  solPriceUsd: number;
}

const springTransition = {
  type: "spring" as const,
  stiffness: 350,
  damping: 28,
};

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
      {copied ? (
        <Check size={14} className="text-green-500" />
      ) : (
        <Copy size={14} />
      )}
    </button>
  );
}

export function RequestDetailModal({
  request,
  isOpen,
  onClose,
  onApprove,
  onDeny,
  processingAction,
  solPriceUsd,
}: RequestDetailModalProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setDetailsOpen(false);
      setBudgetOpen(false);
    }
  }, [isOpen, request?._id]);

  const spending = request?.liveSpendingLimit ?? request?.spendingLimitSnapshot;
  const remaining = spending
    ? Math.max(0, spending.limitAmount - spending.spentAmount)
    : null;
  const usagePercent = spending
    ? Math.min(100, (spending.spentAmount / spending.limitAmount) * 100)
    : 0;

  const isExecuteRequest = request?.metadata?.type === "execute";
  const isProcessing = processingAction !== null;

  return (
    <AnimatePresence>
      {isOpen && request && (
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
            className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/50 bg-white/75 shadow-[0_8px_32px_rgba(0,0,0,0.12)] ring-1 ring-inset ring-white/60 backdrop-blur-2xl"
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

            <div className="px-6 py-7">
              {/* Header */}
              <div className="mb-6 flex items-start gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    isExecuteRequest
                      ? "bg-purple-50 text-purple-600"
                      : "bg-blue-50 text-blue-600",
                  )}
                >
                  <ArrowUpRight size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-gray-900">
                    {isExecuteRequest ? "Execute" : "Transfer"}{" "}
                    {isExecuteRequest && request.metadata?.estimatedValueSol != null
                      ? solPriceUsd > 0
                        ? `~$${(request.metadata.estimatedValueSol * solPriceUsd).toFixed(2)}`
                        : `~${request.metadata.estimatedValueSol} SOL`
                      : solPriceUsd > 0
                        ? formatLamportsAsUsd(request.amountLamports, solPriceUsd)
                        : `${formatSol(request.amountLamports)} SOL`}
                  </h3>
                  {isExecuteRequest && (
                    <span className="mt-0.5 inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">
                      Execute
                    </span>
                  )}
                </div>
              </div>

              {/* Agent */}
              <div className="mb-5">
                <span className="mb-1 block text-xs font-medium text-gray-400">
                  Requested by
                </span>
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <Bot size={12} />
                  </div>
                  <span className="text-sm font-medium text-gray-900">
                    {request.agentName}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                    Agent
                  </span>
                </div>
              </div>

              {/* Amount — USD primary */}
              <div className="mb-5">
                <span className="mb-1 block text-xs font-medium text-gray-400">
                  Amount
                </span>
                <div className="flex items-baseline gap-2">
                  {solPriceUsd > 0 ? (
                    <>
                      <span className="text-lg font-semibold text-gray-900">
                        {formatLamportsAsUsd(request.amountLamports, solPriceUsd)}
                      </span>
                      <span className="text-sm text-gray-400">
                        {formatSol(request.amountLamports)} SOL
                      </span>
                    </>
                  ) : (
                    <span className="text-lg font-semibold text-gray-900">
                      {formatSol(request.amountLamports)} SOL
                    </span>
                  )}
                </div>
              </div>

              {/* Execute details: instruction count + programs */}
              {isExecuteRequest && request.metadata && (
                <div className="mb-5">
                  <span className="mb-1 block text-xs font-medium text-gray-400">
                    Transaction
                  </span>
                  <span className="text-sm text-gray-900">
                    {request.metadata.instructionCount} instruction
                    {request.metadata.instructionCount !== 1 ? "s" : ""}
                  </span>
                  {request.metadata.programs.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {request.metadata.programs.map((pid) => (
                        <span
                          key={pid}
                          className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600"
                          title={pid}
                        >
                          {getProgramName(pid)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Timestamps */}
              <div className="mb-5">
                <span className="mb-1 block text-xs font-medium text-gray-400">
                  Created
                </span>
                <span className="text-sm text-gray-900">
                  {formatFullDateTime(request.createdAt)}
                </span>
                <span className="ml-2 text-xs text-gray-400">
                  {formatRelativeTime(request.createdAt)}
                </span>
              </div>

              {/* Description */}
              {request.description && (
                <div className="mb-5">
                  <span className="mb-1 block text-xs font-medium text-gray-400">
                    Justification
                  </span>
                  <p className="text-sm text-gray-700">{request.description}</p>
                </div>
              )}

              {/* Budget Context — collapsible */}
              {spending && (
                <div className="mb-5">
                  <button
                    onClick={() => setBudgetOpen((prev) => !prev)}
                    className="flex w-full cursor-pointer items-center gap-1 text-xs font-medium text-gray-400 transition-colors hover:text-gray-600"
                  >
                    Budget Context
                    <motion.span
                      animate={{ rotate: budgetOpen ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown size={14} />
                    </motion.span>
                  </button>

                  <AnimatePresence>
                    {budgetOpen && (
                      <motion.div
                        className="mt-2 overflow-hidden rounded-xl bg-gray-50 p-3"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">
                              Limit ({spending.periodType})
                            </span>
                            <span className="font-medium text-gray-900">
                              {formatSol(spending.limitAmount)} SOL
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">Spent</span>
                            <span className="font-medium text-gray-900">
                              {formatSol(spending.spentAmount)} SOL
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">Remaining</span>
                            <span
                              className={cn(
                                "font-medium",
                                remaining != null && remaining > 0
                                  ? "text-green-600"
                                  : "text-red-600",
                              )}
                            >
                              {remaining != null ? formatSol(remaining) : "0"} SOL
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                usagePercent >= 90
                                  ? "bg-red-500"
                                  : usagePercent >= 70
                                    ? "bg-amber-500"
                                    : "bg-green-500",
                              )}
                              style={{ width: `${usagePercent}%` }}
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Advanced Details — merged: recipient + on-chain + error */}
              <div className="mb-5">
                <button
                  onClick={() => setDetailsOpen((prev) => !prev)}
                  className="flex w-full cursor-pointer items-center gap-1 text-xs font-medium text-gray-400 transition-colors hover:text-gray-600"
                >
                  Advanced Details
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
                      className="mt-2 space-y-2 overflow-hidden"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {/* Recipient */}
                      <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                        <div>
                          <span className="block text-[11px] font-medium text-gray-400">
                            Recipient
                          </span>
                          <span className="font-mono text-xs text-gray-700">
                            {truncateAddress(request.recipient, 8)}
                          </span>
                        </div>
                        <CopyButton text={request.recipient} />
                      </div>

                      {/* Proposal */}
                      {request.proposalAddress && (
                        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                          <div>
                            <span className="block text-[11px] font-medium text-gray-400">
                              Proposal
                            </span>
                            <span className="font-mono text-xs text-gray-700">
                              {truncateAddress(request.proposalAddress, 8)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <CopyButton text={request.proposalAddress} />
                            <a
                              href={`https://solscan.io/account/${request.proposalAddress}`}
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

                      {/* Proposal Index */}
                      {request.proposalIndex !== undefined && (
                        <div className="rounded-lg bg-gray-50 px-3 py-2">
                          <span className="block text-[11px] font-medium text-gray-400">
                            Proposal Index
                          </span>
                          <span className="font-mono text-xs text-gray-700">
                            {request.proposalIndex}
                          </span>
                        </div>
                      )}

                      {/* Tx Signature */}
                      {request.txSignature && (
                        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                          <div>
                            <span className="block text-[11px] font-medium text-gray-400">
                              Tx Signature
                            </span>
                            <span className="font-mono text-xs text-gray-700">
                              {truncateAddress(request.txSignature, 8)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <CopyButton text={request.txSignature} />
                            <a
                              href={`https://solscan.io/tx/${request.txSignature}`}
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

                      {/* Error */}
                      {request.errorMessage && (
                        <div className="rounded-lg bg-red-50 px-3 py-2">
                          <span className="block text-[11px] font-medium text-red-400">
                            Error
                          </span>
                          <span className="text-xs text-red-700">
                            {request.errorMessage}
                          </span>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Approve / Reject */}
              {request.status === "pending_approval" && (
                <div className="flex items-center gap-2">
                  <motion.button
                    className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onApprove(request._id)}
                    disabled={isProcessing}
                  >
                    {processingAction === "approve" && (
                      <Loader2 size={14} className="animate-spin" />
                    )}
                    Approve
                  </motion.button>
                  <motion.button
                    className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onDeny(request._id)}
                    disabled={isProcessing}
                  >
                    {processingAction === "deny" && (
                      <Loader2 size={14} className="animate-spin" />
                    )}
                    Reject
                  </motion.button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
