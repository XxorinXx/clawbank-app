import { PrivyProvider as PrivyProviderBase } from '@privy-io/react-auth'
import { env } from '~/env'

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProviderBase
      appId={env.VITE_PRIVY_APP_ID}
      config={{
        loginMethods: ['google', 'email'],
        embeddedWallets: {
          solana: {
            createOnLogin: 'all-users',
          },
        },
        appearance: {
          theme: 'light',
        },
      }}
    >
      {children}
    </PrivyProviderBase>
  )
}
