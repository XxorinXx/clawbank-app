import { z } from 'zod'

const envSchema = z.object({
  VITE_PRIVY_APP_ID: z.string().min(1, 'VITE_PRIVY_APP_ID is required'),
  VITE_CONVEX_URL: z.string().url('VITE_CONVEX_URL must be a valid URL'),
})

export type Env = z.infer<typeof envSchema>

export const env: Env = envSchema.parse({
  VITE_PRIVY_APP_ID: import.meta.env.VITE_PRIVY_APP_ID,
  VITE_CONVEX_URL: import.meta.env.VITE_CONVEX_URL,
})
