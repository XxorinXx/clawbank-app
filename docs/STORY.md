# STORY: 001D Workspace Balance Engine (data only)

## Team Deployment

Deploy Claude Code Agent Team (delegate mode ON):

- Lead
- Backend
- Frontend
- QA

PM/UX not required.

Use shared task list.
Execute only this story until DONE.

## Skills enabled

Backend:

- https://skills.sh/solana-foundation/solana-dev-skill/solana-dev
- https://skills.sh/waynesutton/convexskills/convex-best-practices
- https://skills.sh/waynesutton/convexskills/convex-functions
- https://skills.sh/waynesutton/convexskills/convex-realtime

Jupiter API links :
https://dev.jup.ag/api-reference/tokens/v2/search
https://dev.jup.ag/api-reference/price/v3/price

Frontend:

- https://skills.sh/jezweb/claude-skills/tanstack-query

## Scope (must)

### Backend — token balance pipeline

Implement deterministic balance engine:

1. Fetch token balances using our RPC(please set env for rpc url).
2. Fetch token metadata from Jupiter API.
3. Fetch token prices from Jupiter API.
4. Add **Convex action caching**:
   - metadata cache
   - price cache
   - TTL-based invalidation
5. Compute:
   - per-token USD value
   - total workspace USD balance.

Backend must expose **one query**:

getWorkspaceBalance(workspaceId) →  
returns:

- totalUsd
- tokens[]:
  - mint
  - symbol
  - name
  - icon
  - amount
  - usdValue

Schema design is **backend responsibility**:

- must support fast future queries
- must be indexed properly
- do not over-normalize.

Backend may also expose internal cached endpoints for:

- metadata
- prices

These must use Convex action caching with TTL and must not be called from the client directly (only via hooks).
should aim to reduce api calls and convex usage gb\hr

### Frontend — minimal wiring only (Suspense + hooks)

- Use TanStack Query **useSuspenseQuery** (or useQuery with suspense enabled) for data loading.
- Do not call Convex directly from components. Expose hooks in `src/hooks/`:

Hooks required:

1. `useWorkspaceBalance(workspaceId)`
   - returns: `{ totalUsd, tokens }` (from backend query)
2. `useTokenMetadata(mints[])`
   - returns: metadata map keyed by mint
   - uses cached backend action/query (not direct Jupiter from client)
3. `useTokenPrices(mints[])`
   - returns: price map keyed by mint
   - uses cached backend action/query (not direct Jupiter from client)

- Workspace page renders a temporary JSON/debug view using these hooks.
- No design, animation, modal yet.

### QA

Verify:

- RPC failure handled deterministically.
- Missing metadata handled.
- Zero-balance workspace handled.
- Caching actually used (no repeated external calls).

## Out of scope (must not)

- Token icons UI
- Animated numbers
- Modal list
- Send button
- Any new layout design

## Done Conditions

- lint/typecheck/build/tests pass
- caching confirmed working
- totalUsd correct for sample workspace
- QA edge/security notes written
- DONE: 001D written to docs/PROGRESS.md
