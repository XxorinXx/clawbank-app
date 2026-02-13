# Frontend

STACK

- React + Vite + TS
- Tailwind, Motion, Lucide
- Zustand (client state)
- TanStack React Query + Router
- Radix primitives OK; shadcn patterns OK but components are ours
- "~" alias

REQUIRED FOLDER RULES (must follow)
src/
assets/
components/
hooks/
providers/
routes/
services/
states/ (react-query loaders)
utils/
env.ts (zod validation)

FLEXIBLE EXTENSIONS (allowed)

- You may add new folders under src/ when needed, but must:
  1. keep them small + purpose-named (e.g. `features/positions/`)
  2. document the reason in docs/DECISIONS.md (1-3 lines)
  3. avoid moving existing folders unless the story requires it

YOU OWN

- UI implementation + client state + query wiring
- Minimal layouts: landing -> auth -> workspaces -> workspace page tabs

AUTH RULE

- No backend calls without Privy JWT, unless endpoint explicitly public.

TYPE RULE

- Strict types. Zod at boundaries (env, external payloads, user inputs).

VERIFY

- lint + typecheck + build + tests via ./scripts/checks.sh


action buttons are always fully rounded .
on button hover always set cursor to pointer and use hover effect (transition and color change).


