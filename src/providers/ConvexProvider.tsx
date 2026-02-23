import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react'
import { usePrivy } from '@privy-io/react-auth'
import { useCallback, useMemo, useRef } from 'react'
import { env } from '~/env'

const convex = new ConvexReactClient(env.VITE_CONVEX_URL, {
  unsavedChangesWarning: false,
})

function useConvexAuth() {
  const { ready, authenticated, getAccessToken } = usePrivy()

  // Stable ref for getAccessToken so fetchAccessToken doesn't recreate
  // on every Privy render, which would cause ConvexProviderWithAuth to
  // re-authenticate and briefly drop subscriptions.
  const getAccessTokenRef = useRef(getAccessToken)
  getAccessTokenRef.current = getAccessToken

  const fetchAccessToken = useCallback(
    async (_args: { forceRefreshToken: boolean }) => {
      if (!authenticated) return null
      return await getAccessTokenRef.current()
    },
    [authenticated],
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
