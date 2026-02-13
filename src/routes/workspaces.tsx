import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { useAuth } from '~/hooks/useAuth'
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { useConvexAuth } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Plus, LogOut, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { CreateWorkspaceModal } from '~/components/CreateWorkspaceModal'
import { BalanceHeader } from '~/components/BalanceHeader'
import { TokenListModal } from '~/components/TokenListModal'
import { useWorkspaceBalance } from '~/hooks/useWorkspaceBalance'
import { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/workspaces')({
  component: WorkspacesPage,
} as const)

interface Workspace {
  _id: string
  name: string
  vaultAddress: string
  createdAt: number
}

function truncateAddress(address: string): string {
  if (address.length <= 8) return address
  return `${address.slice(0, 4)}...${address.slice(-4)}`
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function WorkspacesPage() {
  const { isAuthenticated, isLoading, userEmail, walletAddress, logout, exportWallet } =
    useAuth()
  const navigate = useNavigate()
  const { isAuthenticated: isConvexAuthenticated } = useConvexAuth()
  const getOrCreateUser = useMutation(api.users.getOrCreateUser)
  const didSync = useRef(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<Id<"workspaces"> | null>(null)
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false)

  const workspaces = useQuery(
    api.queries.listUserWorkspaces.listUserWorkspaces,
    isConvexAuthenticated ? {} : 'skip',
  ) as Workspace[] | undefined

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void navigate({ to: '/' })
    }
  }, [isLoading, isAuthenticated, navigate])

  useEffect(() => {
    if (!isConvexAuthenticated || !walletAddress || !userEmail || didSync.current)
      return
    didSync.current = true
    getOrCreateUser({ email: userEmail, walletAddress }).catch(() => {
      didSync.current = false
    })
  }, [isConvexAuthenticated, walletAddress, userEmail, getOrCreateUser])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  const hasWorkspaces = workspaces !== undefined && workspaces.length > 0

  return (
    <div className="relative min-h-screen px-4">
      {/* Header */}
      <div className="mx-auto flex max-w-3xl items-center justify-between py-6">
        <h1 className="text-xl font-bold text-gray-900">
          {hasWorkspaces ? 'Workspaces' : ''}
        </h1>
        <div className="flex items-center gap-3">
          {hasWorkspaces && (
            <motion.button
              className="flex cursor-pointer items-center gap-2 rounded-full bg-black px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsModalOpen(true)}
            >
              <Plus size={16} />
              Create workspace
            </motion.button>
          )}
          <motion.button
            className="flex cursor-pointer items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => void exportWallet()}
          >
            <KeyRound size={16} />
            Export Wallet
          </motion.button>
          <motion.button
            className="flex cursor-pointer items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => void logout()}
          >
            <LogOut size={16} />
            Logout
          </motion.button>
        </div>
      </div>

      {/* Content */}
      {hasWorkspaces ? (
        <motion.div
          className="mx-auto max-w-3xl"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex flex-col gap-3">
            {workspaces.map((ws) => (
              <motion.div
                key={ws._id}
                className="cursor-pointer rounded-2xl border border-gray-100 bg-white p-5 transition-colors hover:border-gray-200 hover:bg-gray-50"
                whileHover={{ scale: 1.005 }}
                whileTap={{ scale: 0.995 }}
                onClick={() => {
                  const id = ws._id as Id<"workspaces">
                  if (selectedWorkspaceId === id) {
                    setSelectedWorkspaceId(null)
                    setIsTokenModalOpen(false)
                  } else {
                    setSelectedWorkspaceId(id)
                    setIsTokenModalOpen(false)
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <h3 className="font-semibold text-gray-900">{ws.name}</h3>
                    <p className="font-mono text-sm text-gray-500">
                      {truncateAddress(ws.vaultAddress)}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">
                    {formatDate(ws.createdAt)}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      ) : (
        <div className="flex min-h-[calc(100vh-88px)] items-center justify-center">
          <motion.div
            className="flex w-full max-w-md flex-col items-center text-center"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            {/* Card with plus icon */}
            <motion.div
              className="mb-8 flex h-32 w-32 items-center justify-center rounded-2xl bg-gray-100"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <Plus size={48} className="text-gray-400" />
            </motion.div>

            <h1 className="text-2xl font-bold text-gray-900">
              Welcome to ClawBank
            </h1>
            <p className="mt-3 max-w-[240px] text-center text-sm leading-relaxed text-gray-400">
              Create your first workspace to get started
            </p>

            <div className="mt-7 flex flex-col items-center gap-3">
              <motion.button
                className="cursor-pointer rounded-full bg-black px-8 py-3 font-medium text-white transition-colors hover:bg-gray-800"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsModalOpen(true)}
              >
                Create workspace
              </motion.button>

              <motion.button
                className="cursor-pointer rounded-full px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => toast('Coming soon')}
              >
                Import workspace
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Balance section for selected workspace */}
      {selectedWorkspaceId && (
        <WorkspaceBalanceSection
          workspaceId={selectedWorkspaceId}
          isTokenModalOpen={isTokenModalOpen}
          onOpenModal={() => setIsTokenModalOpen(true)}
          onCloseModal={() => setIsTokenModalOpen(false)}
          onClose={() => {
            setSelectedWorkspaceId(null)
            setIsTokenModalOpen(false)
          }}
        />
      )}

      <CreateWorkspaceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  )
}

function BalanceHeaderSkeleton() {
  return (
    <div className="mx-auto mb-6 max-w-3xl animate-pulse rounded-2xl border border-gray-100 bg-white p-6">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-4 w-24 rounded bg-gray-200" />
          <div className="h-8 w-40 rounded bg-gray-200" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-gray-200" />
          <div className="h-8 w-8 -ml-3 rounded-full bg-gray-200" />
          <div className="h-8 w-8 -ml-3 rounded-full bg-gray-200" />
        </div>
      </div>
    </div>
  )
}

function WorkspaceBalanceSection({
  workspaceId,
  isTokenModalOpen,
  onOpenModal,
  onCloseModal,
  onClose,
}: {
  workspaceId: Id<"workspaces">
  isTokenModalOpen: boolean
  onOpenModal: () => void
  onCloseModal: () => void
  onClose: () => void
}) {
  const { data, isLoading } = useWorkspaceBalance(workspaceId)

  if (isLoading) {
    return <BalanceHeaderSkeleton />
  }

  if (!data || data.tokens.length === 0 || data.totalUsd <= 0) {
    return null
  }

  return (
    <div className="mx-auto max-w-3xl">
      <BalanceHeader
        totalUsd={data.totalUsd}
        tokens={data.tokens}
        onOpenModal={onOpenModal}
        onClose={onClose}
      />
      <TokenListModal
        isOpen={isTokenModalOpen}
        onClose={onCloseModal}
        tokens={data.tokens}
      />
    </div>
  )
}
