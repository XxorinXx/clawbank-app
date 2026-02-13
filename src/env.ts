import { z } from 'zod'

const envSchema = z.object({
  VITE_PRIVY_APP_ID: z.string().min(1, 'VITE_PRIVY_APP_ID is required'),
  VITE_CONVEX_URL: z.string().min(1, 'VITE_CONVEX_URL is required'),
})

export const env = envSchema.parse({
  VITE_PRIVY_APP_ID: import.meta.env.VITE_PRIVY_APP_ID,
  VITE_CONVEX_URL: import.meta.env.VITE_CONVEX_URL,
})
