import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react'
import { usePrivy } from '@privy-io/react-auth'
import { useCallback, useMemo } from 'react'
import { env } from '~/env'

const convex = new ConvexReactClient(env.VITE_CONVEX_URL, {
  unsavedChangesWarning: false,
})

function useConvexAuth() {
  const { ready, authenticated, getAccessToken } = usePrivy()

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (!authenticated) return null
      const token = await getAccessToken()
      // forceRefreshToken is handled by Privy internally
      void forceRefreshToken
      return token
    },
    [authenticated, getAccessToken],
  )

  return useMemo(
    () => ({
      isLoading: !ready,
      isAuthenticated: authenticated,
      fetchAccessToken,
    }),
    [ready, authenticated, fetchAccessToken],
  )
}

export function ConvexProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useConvexAuth}>
      {children}
    </ConvexProviderWithAuth>
  )
}
