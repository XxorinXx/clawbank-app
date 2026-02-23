import { usePrivy, useSolanaWallets } from '@privy-io/react-auth'

interface AuthLoading {
  isAuthenticated: false
  isLoading: true
  userEmail: null
  walletAddress: null
  login: () => void
  logout: () => Promise<void>
  exportWallet: () => Promise<void>
}

interface AuthUnauthenticated {
  isAuthenticated: false
  isLoading: false
  userEmail: null
  walletAddress: null
  login: () => void
  logout: () => Promise<void>
  exportWallet: () => Promise<void>
}

interface AuthAuthenticated {
  isAuthenticated: true
  isLoading: false
  userEmail: string | null
  walletAddress: string | null
  login: () => void
  logout: () => Promise<void>
  exportWallet: () => Promise<void>
}

export type AuthState = AuthLoading | AuthUnauthenticated | AuthAuthenticated

export function useAuth(): AuthState {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const { ready: walletsReady, wallets, exportWallet } = useSolanaWallets()

  const isLoading = !ready || !walletsReady

  const shared = {
    login,
    logout: async () => { await logout() },
    exportWallet: async () => { await exportWallet() },
  }

  if (isLoading) {
    return {
      isAuthenticated: false,
      isLoading: true,
      userEmail: null,
      walletAddress: null,
      ...shared,
    }
  }

  if (!authenticated) {
    return {
      isAuthenticated: false,
      isLoading: false,
      userEmail: null,
      walletAddress: null,
      ...shared,
    }
  }

  return {
    isAuthenticated: true,
    isLoading: false,
    userEmail: user?.email?.address ?? user?.google?.email ?? null,
    walletAddress: wallets[0]?.address ?? null,
    ...shared,
  }
}
