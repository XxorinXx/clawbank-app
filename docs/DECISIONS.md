# Decisions

## Member removal flow v1

**Date**: 2026-02-13
**Story**: 001F
**Authors**: PM/UX + Backend

### Decision

Member removal uses the **Squads proposal flow** (configTransactionCreate), not direct removal.

### What happens on delete

1. A Squads config transaction proposal is created to remove the member from the multisig.
2. The sponsor keypair pays transaction fees.
3. With threshold=1 (current v1 default), the creator auto-approves and executes in the same flow.
4. When threshold > 1 (future), the proposal remains pending until enough members approve.
5. After on-chain execution, the backend reconciles DB membership state.

### Data required

- `workspaceId` — identifies the workspace in Convex DB
- `memberPublicKey` — the Solana public key of the member to remove
- `multisigAddress` — the Squads multisig PDA (from workspace record)

### UI states

| State | Description |
|---|---|
| **idle** | Default. Delete button visible (except for sole member). |
| **confirming** | Confirmation modal open. Shows member name + warning text. Cancel/Confirm buttons. |
| **submitting** | Confirm clicked. Button shows spinner. Modal cannot be closed. |
| **pending** | Proposal created on-chain. If threshold=1, auto-transitions to success. If threshold>1, shows "Awaiting approval" status. |
| **success** | Member removed. Toast notification. Member list re-fetches. |
| **error** | Explicit error message displayed in modal. User can retry or cancel. |

### Constraints

- Cannot remove yourself (the currently authenticated user).
- Cannot remove the last member of a multisig.
- All errors must be surfaced to the user — no silent failures.

---

## Sponsor is fee-payer only — never a multisig member

**Date**: 2026-02-22
**Story**: 0021
**Authors**: Backend

### Decision

The sponsor wallet (`SPONSOR_PRIVATE_KEY`) is used exclusively as a Solana transaction fee payer. It is NOT added as a Squads multisig member.

### Rationale

- Only humans (Privy wallets) and agents (Turnkey wallets) should be multisig members.
- The sponsor having member permissions would be a security concern — a compromised sponsor key could approve/execute proposals.
- All multisig operations (create, propose, approve, execute) require the user's Privy wallet signature from the frontend.
- The sponsor only provides `payerKey` and `rentPayer` fields in Squads instructions.

### Implementation

All Convex actions that build multisig transactions use the **build-then-user-signs** pattern:

1. Backend builds the transaction with sponsor as fee payer, user wallet as creator/member.
2. Backend partial-signs with sponsor keypair.
3. Frontend receives the serialized transaction, user signs with Privy wallet.
4. Frontend submits the fully-signed transaction to the backend for broadcast.

---

## CB-AGENT-SPEND-001 — Agent Spend + Human Approval Transfer Flow

**Date**: 2026-02-23
**Story**: CB-AGENT-SPEND-001
**Authors**: Lead Agent

### Architecture Decisions

#### D1: Transfer Request Model
- New `transfer_requests` table in Convex schema
- Status enum: `pending_execution` | `executed` | `pending_approval` | `approved` | `denied` | `failed`
- Fields: agentId, workspaceId, recipient, amountLamports, shortNote, description, status, spendingLimitSnapshot, txSignature, proposalAddress, errorMessage, timestamps (createdAt, updatedAt)
- Index: by_workspace (for listing), by_agent (for agent-scoped queries)

#### D2: Spending Limit Decision — Pure Function
- Extract `checkSpendingLimit(spentAmount, limitAmount, requestAmount, periodStart, periodDurationMs) → { allowed, remaining, periodExpired }` as a pure testable function
- Period reset logic: if current time > periodStart + periodDuration, reset spentAmount to 0
- This function is the single source of truth for auto-execute vs proposal path

#### D3: Under-Limit Path (Auto-Execute)
- Agent calls `agentTransfer` action with session token auth
- Backend validates session → loads agent + workspace + spending limit
- Calls `checkSpendingLimit` → if allowed:
  - Build SOL transfer via Squads `spendingLimitUse` instruction (vault → recipient)
  - Sign with Turnkey (agent's key)
  - Submit + confirm on-chain
  - Update spentAmount in spending_limits
  - Store request as `executed` with txSignature

#### D4: Over-Limit Path (Proposal)
- Same entry point, but `checkSpendingLimit` returns `allowed: false`
- Create Squads vault transaction + proposal for the SOL transfer
- Store request as `pending_approval` with proposalAddress
- Human approve: frontend calls `approveTransferRequest` → approve + execute proposal on-chain → status `approved`
- Human deny: frontend calls `denyTransferRequest` → reject proposal → status `denied`

#### D5: Agent Auth
- Reuse existing session token pattern from `agentAuth.ts`
- Hash session token → lookup in agent_sessions → validate expiry
- Derive agentId from session (never trust client-provided agentId)

#### D6: Frontend — RequestsTab
- Replace TabPlaceholder for "requests" with real RequestsTab component
- List cards: status badge, recipient (truncated), amount SOL, shortNote, date
- Click to expand: full description, agent name, spending limit snapshot, proposal/tx links, error
- Approve/Deny buttons only for `pending_approval` status
- Uses Convex reactive query for real-time updates

#### D7: Demo Destination
- Fixed: `4MnEbZD5fvvGMHgVN77vZCYixR7zrwQZiydXLDHnMnVB`
- Validated server-side as valid PublicKey

#### D8: Squads SpendingLimitUse for Under-Limit
- Use `@sqds/multisig` `spendingLimitUse` instruction for under-limit transfers
- Agent signs as the spending limit member via Turnkey

### Execution Checklist

- [ ] 1. Schema: Add `transfer_requests` table
- [ ] 2. Pure logic: `checkSpendingLimit` + request status helpers
- [ ] 3. Tests: Unit tests for spending limit decision + status transitions
- [ ] 4. Backend: `agentTransfer` action (session-auth, both paths)
- [ ] 5. Backend: `approveTransferRequest` action (human auth)
- [ ] 6. Backend: `denyTransferRequest` action (human auth)
- [ ] 7. Backend: `listTransferRequests` query (by workspace)
- [ ] 8. Frontend: RequestsTab component with expand/collapse + approve/deny
- [ ] 9. Frontend: Wire RequestsTab into workspaces.tsx
- [ ] 10. Gates: lint, typecheck, build, tests
- [ ] 11. Update PROGRESS.md
