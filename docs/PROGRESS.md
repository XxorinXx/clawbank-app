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
