# ClawBank App

AI-agent banking layer on Solana. Humans create multisig vaults (Squads v4), connect AI agents with bounded spending limits.

## Directory Layout

- `convex/` — Backend functions, DB schema, HTTP endpoints, cron jobs
- `src/` — React frontend (TanStack Router, components, hooks, pages)
- `e2e/` — Playwright end-to-end tests
- `AGENTS/` — Agent instructions, conventions, safety rules, roles
- `docs/` — Architecture docs, PRD, stories, progress, API surface

## Stack

React, TanStack Router, TanStack Query, Convex (backend + DB), Privy v2 (auth), Squads v4 (multisig), Turnkey (agent signer), Tailwind + shadcn/ui, Zustand (local state), Motion (animations)

## Key Rules

- **Mainnet ONLY** — Solana `mainnet-beta`, never devnet/testnet
- **Build-then-sign** — Construct transactions server-side, sign client-side
- **TypeScript strict** — No `any` unless justified
- **"~" import alias only** in frontend
- See `AGENTS/CONVENTIONS.md` for full conventions

## Ralph-style Loop (every story)

Bounded, deterministic loop per story (see `AGENTS/LOOP.md`):
1. Read `docs/STORY.md` + listed Inputs only
2. Implement smallest change set
3. Run verification checks (below) — commit only when green
4. Write `DONE: <story_id>` marker in `docs/PROGRESS.md`
- Max 12 iterations, safety stop on repeated failures or scope creep

## Verification Checks (all must pass before commit/PR)

1. `npx convex dev` — no Convex schema/function errors
2. `npm run lint` — ESLint clean
3. `npm run typecheck` — `tsc -b --noEmit` clean
4. `npm run build` — Vite build succeeds
5. `npm test` — Vitest unit tests pass
6. `npx playwright test` — e2e tests pass (screenshots/videos auto-captured)
- Shortcut: `bash scripts/checks.sh` (lint + typecheck + build + test)

## E2E Testing

Playwright in `e2e/`. Auth state saved in `e2e/.auth/`.
Config: screenshots `on`, video `on`, trace `on` — evidence auto-captured.
Results in `e2e/test-results/`, report in `e2e/playwright-report/`.
**Every story must have a Playwright test** based on the story's acceptance criteria.
**Before running Playwright tests**, ensure `npx convex dev` is running in the background — the frontend requires the Convex backend to function.

## PR Requirements

- Include Playwright screenshots/videos from `e2e/test-results/` in PR description
- Explain what was done and why in the PR body
- One micro-story per PR/commit

## API Surface (SDK integration)

The SDK (`clawbank-sdk`) consumes 4 HTTP endpoints defined in `convex/http.ts`.
**Any endpoint change MUST update `docs/API_SURFACE.md`** — the SDK repo depends on it.

## Completed Stories

001A, 001B, 001C, 001D, 001E, 001F, 0020, 0021, CB-AGENT-SPEND-001
