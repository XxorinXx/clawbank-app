import { useState } from 'react'
import { motion } from 'motion/react'
import { Inbox, Loader2, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useAction } from 'convex/react'
import { useSolanaWallets } from '@privy-io/react-auth'
import { VersionedTransaction } from '@solana/web3.js'
import { api } from '../../convex/_generated/api'
import { Id } from '../../convex/_generated/dataModel'

function truncateAddress(address: string): string {
  if (address.length <= 12) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function lamportsToSol(lamports: number): number {
  return lamports / 1_000_000_000
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending_execution: 'bg-yellow-50 text-yellow-700',
    executed: 'bg-green-50 text-green-700',
    pending_approval: 'bg-amber-50 text-amber-700',
    approved: 'bg-green-50 text-green-700',
    denied: 'bg-red-50 text-red-700',
    failed: 'bg-red-50 text-red-700',
  }

  const labels: Record<string, string> = {
    pending_execution: 'Processing',
    executed: 'Executed',
    pending_approval: 'Pending Approval',
    approved: 'Approved',
    denied: 'Denied',
    failed: 'Failed',
  }

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[status] ?? 'bg-gray-100 text-gray-500'}`}
    >
      {labels[status] ?? status}
    </span>
  )
}

interface RequestsTabProps {
  workspaceId: Id<"workspaces">
}

export function RequestsTab({ workspaceId }: RequestsTabProps) {
  const requests = useQuery(api.queries.transferRequests.list, { workspaceId })
  const { wallets: solanaWallets } = useSolanaWallets()
  const buildApprove = useAction(api.actions.transferApproval.buildApproveTransferRequest)
  const submitApproval = useAction(api.actions.transferApproval.submitTransferApproval)
  const buildDeny = useAction(api.actions.transferApproval.denyTransferRequest)
  const submitDenial = useAction(api.actions.transferApproval.submitTransferDenial)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)

  // Loading skeleton
  if (requests === undefined) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl p-3">
            <div className="h-10 w-10 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-28 rounded bg-gray-200" />
              <div className="h-3 w-20 rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Empty state
  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
          <Inbox size={28} className="text-gray-400" />
        </div>
        <span className="text-sm font-medium">No requests yet</span>
        <span className="mt-1 text-xs text-gray-300">
          Agent transfer requests will appear here
        </span>
      </div>
    )
  }

  const handleApprove = async (requestId: Id<"transfer_requests">) => {
    setProcessingId(requestId)
    try {
      const { serializedTx } = await buildApprove({ requestId })

      const txBytes = Uint8Array.from(atob(serializedTx), (c) => c.charCodeAt(0))
      const tx = VersionedTransaction.deserialize(txBytes)

      const wallet = solanaWallets[0]
      if (!wallet) throw new Error('No Solana wallet found')
      const signedTx = await wallet.signTransaction(tx)
      const signedBase64 = btoa(String.fromCharCode(...signedTx.serialize()))

      await submitApproval({ requestId, signedTx: signedBase64 })
      toast.success('Transfer approved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve transfer')
    } finally {
      setProcessingId(null)
    }
  }

  const handleDeny = async (requestId: Id<"transfer_requests">) => {
    const confirmed = window.confirm('Deny this transfer request?')
    if (!confirmed) return

    setProcessingId(requestId)
    try {
      const { serializedTx } = await buildDeny({ requestId })

      const txBytes = Uint8Array.from(atob(serializedTx), (c) => c.charCodeAt(0))
      const tx = VersionedTransaction.deserialize(txBytes)

      const wallet = solanaWallets[0]
      if (!wallet) throw new Error('No Solana wallet found')
      const signedTx = await wallet.signTransaction(tx)
      const signedBase64 = btoa(String.fromCharCode(...signedTx.serialize()))

      await submitDenial({ requestId, signedTx: signedBase64 })
      toast.success('Transfer denied')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to deny transfer')
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {requests.map((req) => {
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
                  <StatusBadge status={req.status} />
                  <span className="text-sm font-semibold text-gray-900">
                    {lamportsToSol(req.amountLamports)} SOL
                  </span>
                  <span className="text-xs text-gray-400">
                    &rarr; {truncateAddress(req.recipient)}
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
                      {truncateAddress(req.proposalAddress)}
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
                      {truncateAddress(req.txSignature)}
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
