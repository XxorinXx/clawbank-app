import { useState } from 'react'
import { motion } from 'motion/react'
import { Bot, Loader2, Plus, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useAction } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Id } from '../../convex/_generated/dataModel'
import { EditBudgetModal } from './EditBudgetModal'
import { StatusBadge, AGENT_STATUS_STYLES, AGENT_STATUS_LABELS } from './ui/StatusBadge'
import { ListSkeleton } from './ui/ListSkeleton'
import { EmptyState } from './ui/EmptyState'
import { useSignTransaction } from '~/hooks/useSignTransaction'
import { formatDate } from '~/utils/format'

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

interface AgentsTabProps {
  workspaceId: Id<"workspaces">
  onAddAgent: () => void
}

export function AgentsTab({ workspaceId, onAddAgent }: AgentsTabProps) {
  const agents = useQuery(api.queries.agents.list, { workspaceId })
  const buildRevocationTx = useAction(api.actions.buildAgentRevocationTx.buildAgentRevocationTx)
  const submitRevocationTx = useAction(api.actions.buildAgentRevocationTx.submitAgentRevocationTx)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [revokingAgentId, setRevokingAgentId] = useState<Id<"agents"> | null>(null)
  const tx = useSignTransaction()

  const visibleAgents = agents?.filter(a => a.status === 'active') ?? []

  if (agents === undefined) {
    return <ListSkeleton />
  }

  if (visibleAgents.length === 0) {
    return (
      <EmptyState
        icon={<Bot size={28} className="text-gray-400" />}
        title="No agents connected"
        description="Connect your first agent to automate transactions"
        action={{ label: "Add Agent", onClick: onAddAgent }}
      />
    )
  }

  const handleDisconnect = async (agentId: Id<"agents">, agentName: string) => {
    const confirmed = window.confirm(
      `Disconnect ${agentName}? This agent will lose access to the workspace.`,
    )
    if (!confirmed) return

    setRevokingAgentId(agentId)

    const success = await tx.execute({
      build: async () => {
        const result = await buildRevocationTx({ agentId, workspaceId })
        return result
      },
      submit: async ({ signedTx }) => {
        // If no tx was needed (already revoked), send empty string
        const txToSubmit = signedTx || ''
        await submitRevocationTx({ agentId, signedTx: txToSubmit })
      },
    })

    if (success) {
      toast.success(`${agentName} disconnected`)
    } else if (tx.error) {
      toast.error(tx.error)
    }
    setRevokingAgentId(null)
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
                <StatusBadge status={agent.status} styles={AGENT_STATUS_STYLES} labels={AGENT_STATUS_LABELS} />
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
