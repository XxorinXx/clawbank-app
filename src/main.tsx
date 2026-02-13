import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { PrivyProvider } from '~/providers/PrivyProvider'
import { ConvexProvider } from '~/providers/ConvexProvider'
import './index.css'

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrivyProvider>
      <ConvexProvider>
        <RouterProvider router={router} />
      </ConvexProvider>
    </PrivyProvider>
  </StrictMode>,
)
