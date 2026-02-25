import { useState } from "react";
import { motion } from "motion/react";
import { Bot, Check, Inbox, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { ListSkeleton } from "./ui/ListSkeleton";
import { EmptyState } from "./ui/EmptyState";
import { RequestDetailModal, type PendingRequest } from "./RequestDetailModal";
import { useSignTransaction } from "~/hooks/useSignTransaction";
import { useTokenPrices } from "~/hooks/useTokenPrices";
import { formatRelativeTime, formatSol, formatLamportsAsUsd } from "~/utils/format";

const SOL_MINT = "So11111111111111111111111111111111111111112";

interface RequestsTabProps {
  workspaceId: Id<"workspaces">;
}

export function RequestsTab({ workspaceId }: RequestsTabProps) {
  const requests = useQuery(api.queries.transferRequests.listPending, { workspaceId });
  const buildApprove = useAction(api.actions.transferApproval.buildApproveTransferRequest);
  const submitApproval = useAction(api.actions.transferApproval.submitTransferApproval);
  const buildDeny = useAction(api.actions.transferApproval.denyTransferRequest);
  const submitDenial = useAction(api.actions.transferApproval.submitTransferDenial);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState<"approve" | "deny" | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
  const tx = useSignTransaction();
  const { data: priceMap } = useTokenPrices([SOL_MINT]);
  const solPrice = priceMap?.get(SOL_MINT) ?? 0;

  if (requests === undefined) {
    return <ListSkeleton />;
  }

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={<Inbox size={28} className="text-gray-400" />}
        title="All clear"
        description="No pending requests — you're all caught up"
      />
    );
  }

  const handleApprove = async (requestId: string) => {
    setProcessingId(requestId);
    setProcessingAction("approve");
    const success = await tx.execute({
      build: () => buildApprove({ requestId: requestId as Id<"transfer_requests"> }),
      submit: ({ signedTx }) =>
        submitApproval({ requestId: requestId as Id<"transfer_requests">, signedTx }),
    });
    if (success) {
      toast.success("Transfer approved");
      setSelectedRequest(null);
    } else if (tx.error) {
      toast.error(tx.error);
    }
    setProcessingId(null);
    setProcessingAction(null);
  };

  const handleDeny = async (requestId: string) => {
    const confirmed = window.confirm("Are you sure you want to reject this request?");
    if (!confirmed) return;

    setProcessingId(requestId);
    setProcessingAction("deny");
    const success = await tx.execute({
      build: () => buildDeny({ requestId: requestId as Id<"transfer_requests"> }),
      submit: ({ signedTx }) =>
        submitDenial({ requestId: requestId as Id<"transfer_requests">, signedTx }),
    });
    if (success) {
      toast.success("Transfer denied");
      setSelectedRequest(null);
    } else if (tx.error) {
      toast.error(tx.error);
    }
    setProcessingId(null);
    setProcessingAction(null);
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        {requests.map((req) => {
          const isThisProcessing = processingId === req._id;
          const thisAction = isThisProcessing ? processingAction : null;

          return (
            <div
              key={req._id}
              className="rounded-xl border border-gray-100 px-4 py-3 transition-colors hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                {/* Left: info */}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {solPrice > 0
                        ? formatLamportsAsUsd(req.amountLamports, solPrice)
                        : `${formatSol(req.amountLamports)} SOL`}
                    </span>
                    {solPrice > 0 && (
                      <span className="text-xs text-gray-400">
                        {formatSol(req.amountLamports)} SOL
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-600">
                      <Bot size={10} />
                      {req.agentName}
                    </span>
                  </div>
                  {req.shortNote && (
                    <span className="truncate text-xs text-gray-400">
                      {req.shortNote.length > 80
                        ? `${req.shortNote.slice(0, 80)}…`
                        : req.shortNote}
                    </span>
                  )}
                  <span className="text-[11px] text-gray-300">
                    {formatRelativeTime(req.createdAt)}
                  </span>
                </div>

                {/* Right: actions — View more | X (reject) | Check (approve) */}
                <div className="flex shrink-0 items-center gap-1.5">
                  <motion.button
                    className="cursor-pointer rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-200"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedRequest(req as PendingRequest)}
                  >
                    View more
                  </motion.button>

                  {req.status === "pending_approval" && (
                    <>
                      <div className="w-1.5" />
                      <motion.button
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-red-300/60 bg-gray-50 text-red-400 transition-colors hover:bg-red-50 disabled:opacity-50"
                        whileTap={{ scale: 0.9 }}
                        onClick={() => void handleDeny(req._id)}
                        disabled={isThisProcessing}
                        aria-label="Reject"
                      >
                        {thisAction === "deny" ? <Loader2 size={14} className="animate-spin" /> : <X size={14} strokeWidth={2.5} />}
                      </motion.button>
                      <motion.button
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-green-600 text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                        whileTap={{ scale: 0.9 }}
                        onClick={() => void handleApprove(req._id)}
                        disabled={isThisProcessing}
                        aria-label="Approve"
                      >
                        {thisAction === "approve" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.5} />}
                      </motion.button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <RequestDetailModal
        request={selectedRequest}
        isOpen={selectedRequest !== null}
        onClose={() => setSelectedRequest(null)}
        onApprove={(id) => void handleApprove(id)}
        onDeny={(id) => void handleDeny(id)}
        processingAction={processingId === selectedRequest?._id ? processingAction : null}
        solPriceUsd={solPrice}
      />
    </>
  );
}
