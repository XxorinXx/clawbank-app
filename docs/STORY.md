# STORY: 001E Workspace Balance UI

## Team Deployment

Deploy Claude Code Agent Team (delegate mode ON):

- Lead
- PM/UX
- Frontend
- QA

Backend not required unless a bug is found.

Use shared task list.
Execute only this story until DONE.

## Skills enabled

Frontend:

- https://skills.sh/nextlevelbuilder/ui-ux-pro-max-skill/ui-ux-pro-max
- https://skills.sh/jezweb/claude-skills/tailwind-v4-shadcn
- https://skills.sh/jezweb/claude-skills/tanstack-query
- https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices

## Inputs (only allowed files)

- docs/PRD.md
- docs/ACCEPTANCE.md
- AGENTS/\*
- scripts/checks.sh
- existing hooks from 001D:
  - useWorkspaceBalance(...)
  - useTokenMetadata(...)
  - useTokenPrices(...)

## Scope (must)

### Balance header UI (Frontend)

On the workspace page, replace debug JSON with a Balance header section:

Layout:

- Left: Title “Total balance”
- Under title: the `$<totalUsd>` value displayed with a smooth number animation.
- Right of title: token icon stack button:
  - show top 3 token icons
  - overlap icons using negative margin-left ≈ 50% icon width
  - to the right of icons show +[x extra tokens]

Behavior:

- Clicking the icon stack OR “See more” opens a modal.

### Modal token list (Frontend)

Modal contains:

- List of tokens showing:
  - icon
  - name
  - symbol
  - usdValue (per token)
- Sort tokens by usdValue desc.
- Footer: full-width rounded “Send” button (stub, no functionality).

### Empty / loading states

- If zero balance or no tokens:
  - don't render
- Loading:
  - use Suspense fallback skeletons (minimal).

### Constraints

- Do not add new balance fetching logic.
- Do not call Jupiter/RPC directly from UI.
- Only consume the existing hooks.

## Out of scope (must not)

- Send flow
- Token detail pages
- New navigation tabs
- Any backend changes except bugfixes required for UI

## QA requirements

- Run ./scripts/checks.sh
- Edge cases ≥ 4:
  - zero tokens
  - missing icons
  - very large USD value formatting
  - many tokens list performance (basic)
- Security checks ≥ 2:
  - no secrets rendered/logged
  - modal does not leak raw token lists outside auth-gated route

## Done Conditions

- lint/typecheck/build/tests pass
- UI matches spec:
  - icon stack + “See more”
  - modal list + Send stub
  - animated totalUsd
- QA notes written
- DONE: 001E written to docs/PROGRESS.md
