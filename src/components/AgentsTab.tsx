import { useState } from 'react'
import { motion } from 'motion/react'
import { Bot, Loader2, Plus, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useAction } from 'convex/react'
import { useSolanaWallets } from '@privy-io/react-auth'
import { VersionedTransaction } from '@solana/web3.js'
import { api } from '../../convex/_generated/api'
import { Id } from '../../convex/_generated/dataModel'
import { EditBudgetModal } from './EditBudgetModal'

interface AgentLimit {
  tokenMint: string
  tokenSymbol?: string
  limitAmount: number
  spentAmount: number
  periodType: string
  periodStart: number
}

interface Agent {
  _id: Id<"agents">
  name: string
  status: string
  publicKey?: string
  createdAt: number
  limits: AgentLimit[]
}

const AGENT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

function getAgentColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length]
}

function truncateMint(mint: string): string {
  if (mint.length <= 8) return mint
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-50 text-green-700',
    connected: 'bg-gray-100 text-gray-500',
    provisioning: 'bg-yellow-50 text-yellow-700',
    paused: 'bg-gray-100 text-gray-500',
    revoked: 'bg-gray-100 text-gray-500',
  }

  const labels: Record<string, string> = {
    active: 'Active',
    connected: 'Connected',
    provisioning: 'Provisioning',
    paused: 'Disconnected',
    revoked: 'Revoked',
  }

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[status] ?? 'bg-gray-100 text-gray-500'}`}
    >
      {labels[status] ?? status}
    </span>
  )
}

interface AgentsTabProps {
  workspaceId: Id<"workspaces">
  onAddAgent: () => void
}

export function AgentsTab({ workspaceId, onAddAgent }: AgentsTabProps) {
  const agents = useQuery(api.queries.agents.list, { workspaceId })
  const { wallets: solanaWallets } = useSolanaWallets()
  const buildRevocationTx = useAction(api.actions.buildAgentRevocationTx.buildAgentRevocationTx)
  const submitRevocationTx = useAction(api.actions.buildAgentRevocationTx.submitAgentRevocationTx)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [revokingAgentId, setRevokingAgentId] = useState<Id<"agents"> | null>(null)

  const visibleAgents = agents?.filter(a => a.status === 'active') ?? []

  // Loading skeleton
  if (agents === undefined) {
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
  if (visibleAgents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
          <Bot size={28} className="text-gray-400" />
        </div>
        <span className="text-sm font-medium">No agents connected</span>
        <span className="mt-1 text-xs text-gray-300">
          Connect your first agent to automate transactions
        </span>
        <motion.button
          className="mt-4 cursor-pointer rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          whileTap={{ scale: 0.98 }}
          onClick={onAddAgent}
        >
          Add Agent
        </motion.button>
      </div>
    )
  }

  const handleDisconnect = async (agentId: Id<"agents">, agentName: string) => {
    const confirmed = window.confirm(
      `Disconnect ${agentName}? This agent will lose access to the workspace.`,
    )
    if (!confirmed) return

    setRevokingAgentId(agentId)
    try {
      const { serializedTx } = await buildRevocationTx({ agentId, workspaceId })

      if (serializedTx) {
        const txBytes = Uint8Array.from(atob(serializedTx), (c) => c.charCodeAt(0))
        const tx = VersionedTransaction.deserialize(txBytes)

        const wallet = solanaWallets[0]
        if (!wallet) throw new Error('No Solana wallet found')
        const signedTx = await wallet.signTransaction(tx)
        const signedBase64 = btoa(String.fromCharCode(...signedTx.serialize()))

        await submitRevocationTx({ agentId, signedTx: signedBase64 })
      } else {
        await submitRevocationTx({ agentId, signedTx: '' })
      }

      toast.success(`${agentName} disconnected`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disconnect agent')
    } finally {
      setRevokingAgentId(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {(visibleAgents as Agent[]).map((agent) => {
        const color = getAgentColor(agent.name)
        const limit = agent.limits[0]

        return (
          <div
            key={agent._id}
            className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-gray-50"
          >
            {/* Avatar */}
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: `${color}20` }}
            >
              <Bot size={20} style={{ color }} />
            </div>

            {/* Name + budget */}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-gray-900">
                  {agent.name}
                </span>
                <StatusBadge status={agent.status} />
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                {limit ? (
                  <span>
                    {limit.limitAmount} {limit.tokenSymbol ?? truncateMint(limit.tokenMint)}/{limit.periodType}
                  </span>
                ) : (
                  <span>No budget set</span>
                )}
                <span>·</span>
                <span>{formatDate(agent.createdAt)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              {agent.status === 'active' && (
                <>
                  <motion.button
                    className="cursor-pointer rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setEditingAgent(agent)}
                    title="Manage budget"
                  >
                    <Settings2 size={16} />
                  </motion.button>
                  <motion.button
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => void handleDisconnect(agent._id, agent.name)}
                    disabled={revokingAgentId === agent._id}
                  >
                    {revokingAgentId === agent._id && <Loader2 size={12} className="animate-spin" />}
                    {revokingAgentId === agent._id ? 'Disconnecting…' : 'Disconnect'}
                  </motion.button>
                </>
              )}
            </div>
          </div>
        )
      })}

      {/* Add agent button */}
      <motion.button
        className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 py-3 text-sm font-medium text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
        whileTap={{ scale: 0.98 }}
        onClick={onAddAgent}
      >
        <Plus size={16} />
        Add Agent
      </motion.button>

      {/* Edit budget modal */}
      {editingAgent && (
        <EditBudgetModal
          isOpen={!!editingAgent}
          onClose={() => setEditingAgent(null)}
          workspaceId={workspaceId}
          agent={editingAgent}
        />
      )}
    </div>
  )
}
