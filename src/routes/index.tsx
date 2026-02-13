import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { useAuth } from '~/hooks/useAuth'
import { useEffect } from 'react'

export const Route = createFileRoute('/')({
  component: LandingPage,
} as const)

function LandingPage() {
  const { isAuthenticated, isLoading, login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated) {
      void navigate({ to: '/workspaces' })
    }
  }, [isAuthenticated, navigate])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <motion.div
        className="flex flex-col items-center gap-6 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Logo placeholder */}
        <div className="h-20 w-20 rounded-full bg-black" />

        {/* Title and subtitle */}
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight">ClawBank</h1>
          <p className="text-lg text-gray-600">
            Your decentralized banking solution
          </p>
        </div>

        {/* Primary button */}
        <motion.button
          className="hover-effect active:scale-95 cursor-pointer rounded-full bg-black px-8 py-3 font-medium text-white transition-colors hover:bg-gray-800"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={login}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Get started'}
        </motion.button>
      </motion.div>
    </div>
  )
}
