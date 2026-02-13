import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { useAuth } from '~/hooks/useAuth'
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { useConvexAuth } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Plus, LogOut, Globe } from 'lucide-react'
import { toast } from 'sonner'
import { CreateWorkspaceModal } from '~/components/CreateWorkspaceModal'

export const Route = createFileRoute('/workspaces')({
  component: WorkspacesPage,
} as const)

interface Workspace {
  _id: string
  name: string
  multisigAddress: string
  network: string
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
  const { isAuthenticated, isLoading, userEmail, walletAddress, logout } =
    useAuth()
  const navigate = useNavigate()
  const { isAuthenticated: isConvexAuthenticated } = useConvexAuth()
  const getOrCreateUser = useMutation(api.users.getOrCreateUser)
  const didSync = useRef(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

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
                onClick={() => toast('Workspace detail view coming soon')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <h3 className="font-semibold text-gray-900">{ws.name}</h3>
                    <p className="font-mono text-sm text-gray-500">
                      {truncateAddress(ws.multisigAddress)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700">
                      <Globe size={12} />
                      {ws.network}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatDate(ws.createdAt)}
                    </span>
                  </div>
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

      <CreateWorkspaceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  )
}
