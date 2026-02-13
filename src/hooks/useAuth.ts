import { usePrivy, useSolanaWallets } from '@privy-io/react-auth'

interface AuthState {
  isAuthenticated: boolean
  userEmail: string | null
  walletAddress: string | null
  isLoading: boolean
  login: () => void
  logout: () => Promise<void>
}

export function useAuth(): AuthState {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const { ready: walletsReady, wallets } = useSolanaWallets()

  const isLoading = !ready || !walletsReady

  const userEmail = user?.email?.address ?? user?.google?.email ?? null

  // Use the first connected Solana wallet from Privy's Solana wallets hook
  const walletAddress = wallets[0]?.address ?? null

  return {
    isAuthenticated: ready && authenticated,
    userEmail,
    walletAddress,
    isLoading,
    login,
    logout: async () => {
      await logout()
    },
  }
}
