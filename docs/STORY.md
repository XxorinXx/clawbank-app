# STORY: CB-REQ-001 — Redesign Requests Tab (Pending Only + Detail Modal)

## Inputs (the only files agents should read)

- `AGENTS/CONVENTIONS.md`
- `docs/PRD.md`
- `docs/PROGRESS.md`
- `convex/schema.ts`
- `convex/queries/transferRequests.ts`
- `convex/actions/transferApproval.ts`
- `src/components/RequestsTab.tsx`
- `src/components/WorkspaceDrawer.tsx`
- `src/components/DrawerTabs.tsx`
- `src/components/ActivityDetailModal.tsx` (reference for modal pattern)
- `src/utils/format.ts`

## Goal

Redesign the Requests tab to show **only actionable requests** (`pending_approval` + `pending_execution`) in compact rows with always-visible Approve/Reject buttons. A "See More" button opens a rich detail modal with full context (spending limits, on-chain details, dates). Completed/denied/failed requests live exclusively in the Activity tab — clean separation: Requests = actionable, Activity = history.

## Scope (must)

### 1. Backend: Filter query to pending-only

File: `convex/queries/transferRequests.ts`

- Add a new query `listPending` (or modify `list`) that filters to only `pending_approval` and `pending_execution` statuses
- Also add a `pendingCount` query that returns just the count (for the tab badge)
- Keep the existing `list` query intact for backward compatibility
- Enrich with agent names + current spending limit data (live, not snapshot)

### 2. Compact Request Row

File: `src/components/RequestsTab.tsx` (redesign)

Each row shows:
- **Title**: e.g. "Transfer 2.5 SOL" (amount + action)
- **Agent name**: who is requesting
- **Short description**: truncated ~80 chars from `shortNote`
- **Relative timestamp**: "2 min ago"
- **Approve button** (green, always visible)
- **Reject button** (red, always visible)
- **See More button** (subtle, opens detail modal)

Remove the old expand/collapse pattern entirely. The row is flat and compact.

Status filtering: only show `pending_approval` and `pending_execution` requests.

### 3. Request Detail Modal

File: `src/components/RequestDetailModal.tsx` (new)

Follow the existing `ActivityDetailModal` pattern (spring animation + liquid glass styling):

**Always visible:**
- Header: title + status badge
- Agent name + avatar icon
- Amount (SOL primary, USD if available)
- Recipient address (truncated + copy)
- Full description / agent justification
- Created date (full + relative)
- Approve + Reject buttons (same behavior as row)

**Spending Context section:**
- Agent's current spending limit (live from DB)
- Amount spent so far this period
- Remaining budget
- Period type (daily/weekly/monthly)
- Visual: progress bar or fraction display

**Collapsible "On-chain Details" (hidden by default):**
- Proposal address (truncated + copy + Solscan link)
- Tx signature if exists (truncated + copy + Solscan link)
- Proposal index
- Error message (if failed, red background)

**Reject confirmation:**
- Clicking Reject in modal shows a confirmation dialog ("Are you sure you want to reject this request?") before triggering wallet signing
- Approve goes straight to wallet (wallet prompt IS the confirmation)

### 4. Tab Badge (pending count)

File: `src/components/DrawerTabs.tsx` + `src/components/WorkspaceDrawer.tsx`

- Add support for a `badge` (number or ReactNode) on `TabItem`
- Show amber dot + count on the "Requests" tab when there are pending requests
- Badge disappears when count is 0
- Use the `pendingCount` query in `WorkspaceDrawer` to feed the badge

### 5. Empty State

When no pending requests exist:
- Icon: Inbox (existing)
- Title: "All clear"
- Description: "No pending requests — you're all caught up"

### 6. Loading State

- Use existing `<ListSkeleton />` pattern while query loads

## Out of scope (must not)

- Push notifications / email alerts for new requests
- Batch approve/reject multiple requests
- Activity tab changes (already works)
- Dark mode
- Request history in Requests tab (all history is in Activity)

## UX + Acceptance (objective)

### Only pending requests shown
- Given a vault with pending and completed transfer requests
- When a user opens the Requests tab
- Then only `pending_approval` and `pending_execution` requests are visible
- And completed/denied/failed requests do NOT appear

### Compact row shows correct info
- Each row shows: title (amount), agent name, short description, timestamp
- Approve (green) and Reject (red) buttons are always visible on every row
- "See More" button is visible on every row

### Tab badge shows pending count
- Given 3 pending requests
- Then the Requests tab label shows an amber badge with "3"
- When all are approved/denied, badge disappears

### Detail modal opens with animation
- When the user clicks "See More" on a request row
- Then a modal opens with spring animation and liquid glass blur
- The modal shows full details: description, agent, amount, recipient, dates, spending context
- Approve and Reject buttons work from inside the modal
- "On-chain Details" section is collapsed by default
- Pressing Escape or clicking backdrop closes the modal

### Spending context is accurate
- The modal shows the agent's CURRENT spending limit (live query, not just snapshot)
- Shows spent amount and remaining budget for the current period

### Reject confirmation
- Clicking Reject (in row or modal) shows "Are you sure?" confirmation
- Clicking Approve goes directly to wallet signing

### Approve flow works
- Clicking Approve triggers wallet signing
- On success: toast "Transfer approved", request disappears from list, count decrements
- On failure: toast with error message

### Deny flow works
- Clicking Reject shows confirmation dialog
- On confirm: triggers wallet signing
- On success: toast "Transfer denied", request disappears from list
- On cancel: nothing happens

### Empty state
- Given a vault with no pending requests
- When the user opens the Requests tab
- Then they see "All clear — No pending requests"

### Real-time updates
- New pending requests appear in the list without refresh (Convex reactive queries)
- Approved/denied requests disappear from the list in real-time

## Design language

- **Enterprise, not crypto** — "Transfer Request" not "SOL Transaction Proposal"
- **Normie-first** — amounts in SOL with USD context, no raw hashes in primary view
- **Clean density** — compact rows with generous whitespace, muted secondary text
- **Liquid glass modal** — translucent surface, backdrop blur, spring physics (match ActivityDetailModal)
- **Always-actionable** — approve/reject visible without extra clicks

## Skills enabled

- Convex
- Vercel React best practices
- Tailwind + shadcn/ui
- Motion (Framer Motion)
- UI/UX Pro Max

## Done conditions (hard gates)

- [ ] `convex/queries/transferRequests.ts` — `listPending` query filters to pending statuses only
- [ ] `convex/queries/transferRequests.ts` — `pendingCount` query returns count for badge
- [ ] `RequestsTab` redesigned with compact rows (title, agent, description, timestamp)
- [ ] Approve + Reject buttons always visible on every row
- [ ] "See More" opens `RequestDetailModal`
- [ ] `RequestDetailModal` with spring animation + liquid glass styling
- [ ] Modal shows full details: description, agent, amount, recipient, dates
- [ ] Modal shows spending context: current limit, spent, remaining, period
- [ ] Collapsible "On-chain Details" with proposal/tx sig + Solscan links
- [ ] Reject confirmation dialog before wallet signing
- [ ] Tab badge shows pending count (amber dot + number)
- [ ] Badge disappears when count is 0
- [ ] Empty state: "All clear — No pending requests"
- [ ] Loading skeleton while fetching
- [ ] Real-time: requests appear/disappear without refresh
- [ ] lint passes
- [ ] typecheck passes
- [ ] build passes
- [ ] unit tests pass
- [ ] Playwright e2e test: open Requests tab, verify rows render, open modal, close modal
- [ ] Completion marker: `DONE: CB-REQ-001` in `docs/PROGRESS.md`
