import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import path from 'path'

export default defineConfig({
  plugins: [TanStackRouterVite(), react()],
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src'),
    },
  },
  define: {
    'global': 'globalThis',
  },
  server: {
    watch: {
      // Prevent Vite from triggering a full page reload when the Convex CLI
      // regenerates its type-definition / JS barrel files.  Without this
      // exclusion, every `npx convex dev` sync rewrites
      // `convex/_generated/api.d.ts` (and friends), Vite detects the change,
      // and issues a full reload.  If a Convex action is in-flight at that
      // moment (e.g. during the agent-activation wallet-signing flow), the
      // Convex client's built-in `beforeunload` guard fires and Chrome shows
      // the "Reload site? Changes you made may not be saved." dialog.
      //
      // Use absolute path for reliable chokidar matching, plus the glob
      // fallback.  Also ignore .clawbank credential file writes.
      ignored: [
        path.resolve(__dirname, 'convex/_generated') + '/**',
        '**/convex/_generated/**',
        '**/.clawbank',
        '**/node_modules/**',
      ],
    },
  },
})
