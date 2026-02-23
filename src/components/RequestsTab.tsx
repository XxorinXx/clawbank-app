import { useState } from 'react'
import { motion } from 'motion/react'
import { Inbox, Loader2, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useAction } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Id } from '../../convex/_generated/dataModel'
import { StatusBadge, REQUEST_STATUS_STYLES, REQUEST_STATUS_LABELS } from './ui/StatusBadge'
import { ListSkeleton } from './ui/ListSkeleton'
import { EmptyState } from './ui/EmptyState'
import { useSignTransaction } from '~/hooks/useSignTransaction'
import { truncateAddress, formatDate, lamportsToSol } from '~/utils/format'

interface RequestsTabProps {
  workspaceId: Id<"workspaces">
}

export function RequestsTab({ workspaceId }: RequestsTabProps) {
  const requests = useQuery(api.queries.transferRequests.list, { workspaceId })
  const buildApprove = useAction(api.actions.transferApproval.buildApproveTransferRequest)
  const submitApproval = useAction(api.actions.transferApproval.submitTransferApproval)
  const buildDeny = useAction(api.actions.transferApproval.denyTransferRequest)
  const submitDenial = useAction(api.actions.transferApproval.submitTransferDenial)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const tx = useSignTransaction()

  if (requests === undefined) {
    return <ListSkeleton />
  }

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={<Inbox size={28} className="text-gray-400" />}
        title="No requests yet"
        description="Agent transfer requests will appear here"
      />
    )
  }

  const handleApprove = async (requestId: Id<"transfer_requests">) => {
    setProcessingId(requestId)
    const success = await tx.execute({
      build: () => buildApprove({ requestId }),
      submit: ({ signedTx }) => submitApproval({ requestId, signedTx }),
    })
    if (success) {
      toast.success('Transfer approved')
    } else if (tx.error) {
      toast.error(tx.error)
    }
    setProcessingId(null)
  }

  const handleDeny = async (requestId: Id<"transfer_requests">) => {
    const confirmed = window.confirm('Deny this transfer request?')
    if (!confirmed) return

    setProcessingId(requestId)
    const success = await tx.execute({
      build: () => buildDeny({ requestId }),
      submit: ({ signedTx }) => submitDenial({ requestId, signedTx }),
    })
    if (success) {
      toast.success('Transfer denied')
    } else if (tx.error) {
      toast.error(tx.error)
    }
    setProcessingId(null)
  }

  return (
    <div className="flex flex-col gap-2">
      {requests.map((req: typeof requests[number]) => {
        const isExpanded = expandedId === req._id
        const isProcessing = processingId === req._id

        return (
          <div
            key={req._id}
            className="rounded-xl border border-gray-100 px-3 py-3 transition-colors hover:bg-gray-50"
          >
            {/* Summary row */}
            <div
              className="flex cursor-pointer items-center gap-3"
              onClick={() => setExpandedId(isExpanded ? null : req._id)}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <StatusBadge status={req.status} styles={REQUEST_STATUS_STYLES} labels={REQUEST_STATUS_LABELS} />
                  <span className="text-sm font-semibold text-gray-900">
                    {lamportsToSol(req.amountLamports)} SOL
                  </span>
                  <span className="text-xs text-gray-400">
                    &rarr; {truncateAddress(req.recipient, 6)}
                  </span>
                </div>
                {req.shortNote && (
                  <span className="truncate text-xs text-gray-500">{req.shortNote}</span>
                )}
                <span className="text-xs text-gray-400">{formatDate(req.createdAt)}</span>
              </div>
              {isExpanded ? (
                <ChevronUp size={16} className="shrink-0 text-gray-400" />
              ) : (
                <ChevronDown size={16} className="shrink-0 text-gray-400" />
              )}
            </div>

            {/* Expanded details */}
            {isExpanded && (
              <motion.div
                className="mt-3 space-y-2 border-t border-gray-100 pt-3 text-xs text-gray-600"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ duration: 0.2 }}
              >
                {req.description && (
                  <div>
                    <span className="font-medium text-gray-500">Description:</span>{' '}
                    {req.description}
                  </div>
                )}
                <div>
                  <span className="font-medium text-gray-500">Agent:</span> {req.agentName}
                </div>
                {req.spendingLimitSnapshot && (
                  <div>
                    <span className="font-medium text-gray-500">Spending Limit:</span>{' '}
                    {lamportsToSol(req.spendingLimitSnapshot.limitAmount)} SOL / {req.spendingLimitSnapshot.periodType}, Spent:{' '}
                    {lamportsToSol(req.spendingLimitSnapshot.spentAmount)} SOL
                  </div>
                )}
                {req.proposalAddress && (
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-gray-500">Proposal:</span>{' '}
                    <a
                      href={`https://solscan.io/account/${req.proposalAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      {truncateAddress(req.proposalAddress, 6)}
                      <ExternalLink size={10} />
                    </a>
                  </div>
                )}
                {req.txSignature && (
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-gray-500">Transaction:</span>{' '}
                    <a
                      href={`https://solscan.io/tx/${req.txSignature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      {truncateAddress(req.txSignature, 6)}
                      <ExternalLink size={10} />
                    </a>
                  </div>
                )}
                {req.status === 'failed' && req.errorMessage && (
                  <div className="text-red-600">
                    <span className="font-medium">Error:</span> {req.errorMessage}
                  </div>
                )}

                {/* Approve / Deny buttons */}
                {req.status === 'pending_approval' && (
                  <div className="flex items-center gap-2 pt-2">
                    <motion.button
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                      whileTap={{ scale: 0.95 }}
                      onClick={() => void handleApprove(req._id)}
                      disabled={isProcessing}
                    >
                      {isProcessing && <Loader2 size={12} className="animate-spin" />}
                      Approve
                    </motion.button>
                    <motion.button
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                      whileTap={{ scale: 0.95 }}
                      onClick={() => void handleDeny(req._id)}
                      disabled={isProcessing}
                    >
                      {isProcessing && <Loader2 size={12} className="animate-spin" />}
                      Deny
                    </motion.button>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        )
      })}
    </div>
  )
}
