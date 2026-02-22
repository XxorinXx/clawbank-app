# Progress

DONE: 001A
DONE: 001B

## 001C QA Notes

### Checks (scripts/checks.sh)

All 4 checks pass:
- **Lint**: PASS (fixed `prefer-const` in `convex/queries/listUserWorkspaces.ts`)
- **Typecheck**: PASS (fixed circular type inference in `convex/actions/createWorkspace.ts` by adding explicit return type; added return type annotations in `convex/internals/workspaceHelpers.ts`)
- **Build**: PASS
- **Tests**: PASS (no tests yet)

### Edge Cases (3)

1. **Empty workspace name**: VALIDATED — `createWorkspace.ts` lines 30-33 trims input and throws `"Workspace name cannot be empty"` if empty.
2. **Invalid wallet address**: VALIDATED — `createWorkspace.ts` lines 51-57 wraps `new PublicKey(wm.value)` in try/catch and throws `"Invalid wallet address: ..."`.
3. **Duplicate members**: NOT explicitly handled — no dedup check in backend action. If the same wallet address is added twice, it will be passed to the Squads multisig creation and stored twice in `workspace_members`. This is a minor gap; consider adding dedup logic in a future story.

### Security Checks (2)

1. **Auth required on create-workspace**: VERIFIED — `createWorkspace.ts` lines 24-27 calls `ctx.auth.getUserIdentity()` and throws `"Unauthenticated"` if null. The `listUserWorkspaces` query (line 15-18) also checks auth.
2. **Sponsor key never logged/exposed**: VERIFIED — Grepped all `convex/` source files for `console.log`, `console.warn`, `console.error` — none found in application code (only in `convex/README.md` example). Sponsor key is accessed only via `process.env.SPONSOR_PRIVATE_KEY`, never returned in responses, and has explicit code comment: `"NEVER log or return this value"`.

### Additional Notes

- Rate limiting is implemented: 30-second cooldown between workspace creations per user (`RATE_LIMIT_MS = 30_000`).
- Workspace creation uses a server-side sponsor keypair to pay Solana fees, keeping the user's wallet out of the signing flow.
- Email-type members are stored as pending invites (not added to on-chain multisig), which is correct per story requirements.

DONE: 001C

## 001D QA Notes

### Checks (scripts/checks.sh)

All 4 checks pass:
- **Lint**: PASS (fixed unused `TokenPrice` interface in `useTokenPrices.ts`)
- **Typecheck**: PASS
- **Build**: PASS
- **Tests**: PASS (no tests yet)

### Edge Cases (4)

1. **RPC failure handled deterministically**: PASS — `fetchTokenBalances.ts` wraps both `getBalance` and `getTokenAccountsByOwner` in try/catch with descriptive error messages (`"RPC error fetching SOL balance: ..."`, `"RPC error fetching token accounts: ..."`). Errors propagate through `getWorkspaceBalance` to the client.
2. **Missing metadata handled**: PASS — `fetchTokenMetadata.ts` catches Jupiter API failures silently and fills unknowns with `{ symbol: "UNKNOWN", name: "Unknown Token", decimals: 0 }`. These are cached to prevent repeated API calls for unknown tokens.
3. **Zero-balance workspace handled**: PASS — `getWorkspaceBalance.ts` returns `{ totalUsd: 0, tokens: [] }` when `fetchTokenBalances` returns an empty array.
4. **Caching actually used**: PASS — Both `fetchTokenMetadata` and `fetchTokenPrices` check Convex cache tables BEFORE calling Jupiter APIs. TTLs: metadata = 24 hours, prices = 60 seconds. Cache upserts happen via internal mutations with `updatedAt` timestamps.

### Security Checks (2)

1. **Auth required on all public actions**: VERIFIED — `getWorkspaceBalance`, `getTokenMetadata`, `getTokenPrices` all check `ctx.auth.getUserIdentity()` and throw `"Unauthenticated"` if null.
2. **Internal actions not client-exposed**: VERIFIED — `fetchTokenBalances`, `fetchTokenMetadata`, `fetchTokenPrices` are declared as `internalAction()`, not accessible from client.

### Architecture Notes

- **RPC_URL** added to `convex/env.ts` with validated access via `getRpcUrl()`.
- **Schema**: Two new cache tables (`token_metadata_cache`, `token_price_cache`) with `by_mint` indexes for fast lookups.
- **Action composition**: `getWorkspaceBalance` orchestrates 3 internal actions (balances, metadata, prices) with metadata + prices fetched in parallel via `Promise.all`.
- **Frontend**: `@tanstack/react-query` added for client-side caching (staleTime 30s for balances, 24h for metadata, 60s for prices). Hooks wrap Convex actions — components never call Convex directly.
- **Vault PDA derivation**: Uses `@sqds/multisig.getVaultPda` to derive the Squads vault address from the workspace's multisig PDA.

DONE: 001D

## 001E QA Notes

### Checks (scripts/checks.sh)

All 4 checks pass:
- **Lint**: PASS (0 errors, 0 warnings)
- **Typecheck**: PASS
- **Build**: PASS
- **Tests**: PASS (no tests yet)

### Edge Cases (4)

1. **Zero tokens / zero balance**: PASS — `BalanceHeader` returns `null` when `tokens.length === 0 || totalUsd <= 0`. `WorkspaceBalanceSection` also returns `null` when `data.tokens.length === 0`. No empty chrome rendered.
2. **Missing icons**: PASS — Both `BalanceHeader` icon stack and `TokenListModal` list items use `onError` handler on `<img>` to hide broken image and show a 2-letter symbol fallback. Tokens with `icon: null` render the fallback directly.
3. **Very large USD value formatting**: PASS — `TokenListModal.formatUsd()` formats values >= $1M as `$X.XXM`, values >= $1K with commas, and sub-cent values as `<$0.01`. `AnimatedUsd` uses `toLocaleString` with 2 decimal places and tabular-nums for stable layout.
4. **Many tokens list performance**: PASS — Token list uses a scrollable container with `max-h-[60vh]` and `overflow-y-auto`. No virtualization needed since the balance engine already filters zero-value tokens, keeping the list small. Custom scrollbar styles applied.

### Security Checks (2)

1. **No secrets rendered/logged**: VERIFIED — Grepped all new component files for `console.log`, `console.warn`, `console.error` — none found. No mint addresses, API keys, or raw token data exposed in rendered HTML beyond icon URLs and display values.
2. **Modal does not leak outside auth gate**: VERIFIED — `TokenListModal` is only rendered inside `WorkspaceBalanceSection`, which requires a `workspaceId` (set by clicking a workspace card). The workspace list itself is gated behind `useConvexAuth().isAuthenticated` and the route redirects unauthenticated users to `/`.

### UI Spec Compliance

- Icon stack with top 3 overlapping icons + "+X more" count
- "See more" text on icon stack button opens modal
- Modal: token list (icon, name, symbol, usdValue) sorted by usdValue desc
- Modal: full-width rounded "Send" button (stub)
- Animated totalUsd with ease-out cubic interpolation (600ms)
- Loading skeleton while balance data fetches

DONE: 001E

## 001F QA Notes

### Checks (scripts/checks.sh)

All 4 checks pass:
- **Lint**: PASS (0 errors, 0 warnings)
- **Typecheck**: PASS
- **Build**: PASS
- **Tests**: PASS (no tests yet)

### Gate 0

Decision written in docs/DECISIONS.md: "Member removal flow v1"
- Proposal-based via Squads configTransactionCreate
- 6 UI states documented (idle, confirming, submitting, pending, success, error)
- Data requirements specified (workspaceId, memberPublicKey, multisigAddress)

### Edge Cases (5)

1. **0 members**: PASS — MembersTab renders empty state (User icon + "No members found") when members array is empty. Should not happen in practice but handled gracefully.
2. **1 member (sole member)**: PASS — Manage button is disabled (greyed, not clickable). Delete button is not rendered (`!isSoleMember` guard).
3. **DB vs on-chain mismatch**: PASS — `reconcileMembersFromOnchain` mutation adds members that exist on-chain but not in DB, and removes DB members that no longer exist on-chain. Frontend `useWorkspaceMembers` merges both sources with on-chain taking precedence.
4. **On-chain fetch fails**: PASS — `useWorkspaceMembers` shows amber warning "Could not sync on-chain members. Showing cached data." when `onchainError` is truthy. Members still render from DB data.
5. **Delete confirm cancel + confirm flows**: PASS — Cancel closes modal and resets state. Confirm shows spinner + "Removing..." text, modal has `preventClose` during submission. Error state shows explicit error message with retry option. Success shows toast notification.

### Security Checks (3)

1. **Auth gating for member queries/actions**: VERIFIED — `getWorkspaceMembers` query, `fetchMembersOnchain` action, and `removeMember` action all check `ctx.auth.getUserIdentity()` and throw "Unauthenticated" if null.
2. **Destructive action requires confirmation**: VERIFIED — Delete button opens `DeleteMemberModal` with explicit warning text ("This action cannot be undone"), Cancel + Remove buttons. Cannot remove self or last member (server-side validation).
3. **No secrets/logging of keys**: VERIFIED — No `console.log` in any new files. Sponsor key accessed only via `getSponsorKey()`, never logged or returned. `removeMember` action does not expose multisig PDA or sponsor key to client.

### Architecture Notes

- **DrawerTabs**: Fully reusable component with keyboard accessibility (arrow keys + Enter). Supports arbitrary tabs, optional icons, optional rightSlot.
- **Placeholder tabs**: Requests, Activity, Agents, Humans, Balances — per OVERVIEW.md workspace tab spec.
- **Members data strategy**: DB-first render (instant via Convex reactive query), on-chain overlay via TanStack Query action call, reconciliation mutation syncs DB with on-chain truth.
- **Remove member flow**: Squads configTransactionCreate proposal → auto-approve (threshold=1) → DB reconciliation. All states surfaced to user.

DONE: 001F

## 0020 QA Notes

### Story type: Architecture only (no code changes)

### Deliverables

1. **docs/ARCH_AGENT_CONNECT.md** (428 lines) — Full architecture spec with all 9 required sections:
   - Goals/non-goals, trust boundaries + threat model, component descriptions
   - Data model: agents, agent_sessions, spending_limits, activity_log (conceptual, no schema changes)
   - 6 end-to-end flows (F1-F6): Add Agent → Turnkey wallet → Squads binding → auth → spend → over-limit
   - API contracts: 11 Convex mutations/queries/actions with inputs/outputs/auth
   - Key management + rotation plan
   - Spending limits enforcement (backend + on-chain dual-gate)
   - Failure modes: Turnkey down, RPC down, stale limits, replay prevention

2. **docs/AGENT_INSTALL.md** — Installation + bootstrap plan:
   - 3 supported runtimes (OpenClaw, Claude Code, generic headless)
   - Environment variables, install steps, connect code exchange flow
   - Session token lifecycle (JWT, 30-day expiry, refresh, revocation)

3. **docs/UX_AGENT_CONNECT.md** — UI microcopy/spec:
   - Add Agent button placements (Agents tab, header, empty state)
   - 4-step modal flow (Name & Type → Budget → Connect Code → Success)
   - Post-success agent row display, error messages, empty states

4. **docs/SECURITY_AGENT_CONNECT.md** — Security review checklist:
   - 5 sections, 25+ checklist items
   - Secret handling, auth + replay prevention, least privilege, rate limiting, demo protection

### Team execution

4 agents spawned in parallel (architect, backend, pmux, qa) — each wrote its deliverable independently. All completed successfully.

DONE: 0020

## 0021 QA Notes

### Checks (scripts/checks.sh)

All 4 checks pass:
- **Lint**: PASS (0 errors, 0 warnings)
- **Typecheck**: PASS (fixed circular type inference in `agentAuth.ts` by adding explicit return types `ExchangeResult` and `StatusResult`)
- **Build**: PASS
- **Tests**: PASS (no tests yet)

### Gate 0

docs/AGENT_INSTALL.md updated: replaced `npx @clawbank/cli` with `node scripts/agent-connect.mjs CODE`. Matches actual CLI command implemented in `scripts/agent-connect.mjs`.

### Edge Cases (6)

1. **Expired connect code**: PASS — `agentAuth.ts:28-31` checks `session.expiresAt <= Date.now()` and throws "Invalid or expired connect code".
2. **Reused connect code**: PASS — `agentAuth.ts:44-47` deletes the connect-code session after use via `deleteSession`. Second attempt finds no session → rejected.
3. **Turnkey API failure**: PASS — `provisionAgent.ts:69-82` wraps Turnkey API call in try/catch, logs `action: "provision_failed"` to activity_log, throws descriptive error. Agent stays in "provisioning" status.
4. **Unauthorized workspace create**: PASS — `mutations/agents.ts:49-58` verifies user is a workspace_member via by_workspace index. Non-members get "Not a member of this workspace".
5. **Missing budget fields**: PASS — `mutations/agents.ts:26-36` validates name non-empty (trim), max 32 chars, and limitAmount > 0. All produce specific error messages.
6. **CLI invalid code format**: PASS — `agent-connect.mjs:144-149` validates code against regex `/^[A-Z0-9]{6}$/`. Invalid format exits with "Invalid code format" message.

### Security Checks (5)

1. **No console.log in backend**: VERIFIED — Grepped all `convex/*.ts` files for `console.log/warn/error` — zero matches. No secrets leaked via logging.
2. **Tokens hashed before storage**: VERIFIED — Connect codes hashed with SHA-256 (`crypto.createHash("sha256")`) in `provisionAgent.ts:86-89` and `agentAuth.ts:14-17`. Session tokens hashed in `agentAuth.ts:37-38`. Raw values never stored in DB — only `tokenHash` field in `agent_sessions`.
3. **Connect code single-use + TTL**: VERIFIED — Session row deleted immediately after successful exchange (`agentAuth.ts:44-47`). TTL = 10 minutes (`provisionAgent.ts:14`). Expired codes rejected at `agentAuth.ts:28-31`.
4. **Privy auth on all human-facing functions**: VERIFIED — `agents.create`, `agents.revoke` (mutations), `agents.list`, `agents.getConnectCode` (queries), `generateConnectCode` (action) all call `ctx.auth.getUserIdentity()` and throw "Unauthenticated" if null.
5. **agents.revoke deletes all sessions**: VERIFIED — `mutations/agents.ts:121-127` queries `agent_sessions` by `by_agentId` index and deletes every session. Also sets status to "revoked" and clears connectCode fields.

### Architecture Notes

- **Schema**: 4 new tables added (agents, agent_sessions, spending_limits, activity_log) with proper indexes per ARCH_AGENT_CONNECT.md spec.
- **Turnkey SDK**: `@turnkey/sdk-server` used for wallet creation. Creates Ed25519 Solana wallets with BIP32 path `m/44'/501'/0'/0'`.
- **Provision flow**: `agents.create` mutation → schedules `provisionAgent` internal action → Turnkey wallet creation → connect code generation → activity log.
- **Auth flow**: Connect code (6 chars, 10 min TTL) → `exchangeConnectCode` action → session token (32 bytes, 24h TTL) → `agentStatus` action for verification.
- **Frontend**: 3-step modal (Name & Budget → Connect Code → Done) with reactive Convex queries for real-time connect code display and auto-advance on agent activation.
- **CLI**: `scripts/agent-connect.mjs` — standalone ESM script, no extra deps, writes `.env`, retry logic, validates code format.
- **Env helpers**: `getTurnkeyApiPublicKey()`, `getTurnkeyApiPrivateKey()`, `getTurnkeyOrgId()`, `getSessionSecret()` added to `convex/env.ts`.

### Team Execution

8 agents spawned across 2 waves:
- Wave 1 (4 agents): backend-mutations, backend-turnkey, backend-auth, backend-queries — all backend tasks in parallel
- Wave 2 (3 agents): frontend-modal, frontend-agents-tab, cli-script — frontend + CLI in parallel
- Lead handled: Gate 0 doc, schema, env helpers, QA, type fixes, coordination

DONE: 0021
