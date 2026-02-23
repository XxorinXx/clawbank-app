# STORY: CB-AGENT-SPEND-001 Agent Spend + Human Approval Transfer Flow (SOL transfer demo)

## Inputs (the only files agents should read)

- OVERVIEW.md
- STORY_TAMPLATE.md
- docs/PRD.md
- docs/ACCEPTANCE.md
- docs/ARCH.md (if exists)
- docs/PROGRESS.md
- convex/ (all Convex schema + functions)
- src/ (frontend app)
- src/routes (TanStack Router / Start routes)
- src/components (shadcn UI components)
- src/lib/solana (or wherever Solana helpers live)
- src/lib/squads (or wherever Squads helpers live)

## Scope (must)

### Goal

Implement two end-to-end flows for a SOL transfer to:
`4MnEbZD5fvvGMHgVN77vZCYixR7zrwQZiydXLDHnMnVB`

1. **Agent spend within limit (auto-execute):**
   - Agent creates a transfer request with:
     - short note (very short)
     - description (longer)
     - “what this pays for” + “why”
   - System checks agent spending limit.
   - If under limit: backend signs and submits tx (Turnkey signer) and stores status + tx signature.
   - Request appears in UI (Requests tab) as “Executed” with details and tx link.

2. **Agent spend requiring human approval (proposal):**
   - Same transfer request fields (short note + description + metadata).
   - If over limit (or forced approval mode): create an on-chain **Squads proposal** for the transfer.
   - Store proposal address/ID in Convex and show request in UI as “Pending Approval”.
   - Human can **Approve** or **Deny** from the UI.
   - Approve => approve/execute proposal on-chain; update request status to Approved/Executed.
   - Deny => reject proposal on-chain (or mark as denied + close); update request status to Denied.

### UX surface

- Requests tab is the operating surface for these requests (list view).
- Each request card shows:
  - Status badge (Pending / Executed / Approved / Denied / Failed)
  - Recipient (short)
  - Amount (SOL)
  - **Short note**
  - Created date
  - Expand/collapse to reveal:
    - Full description
    - Initiator (agent id)
    - Spending limit snapshot used for decision
    - Proposal address (if any)
    - Tx signature (if any)
    - Error message (if failed)

## Out of scope (must not)

- Destination allowlists (explicitly deferred in overview)
- Swaps, token transfers, SPL tokens (SOL only)
- Deep on-chain indexing beyond what’s needed for this flow
- Advanced policies beyond “spending limit gate + approval”
- Multi-workflow batching or recurring payments

## UX + Acceptance (objective)

### Under-limit path

- Given a workspace with an agent and a spending limit that covers the transfer amount
- When the agent submits a SOL transfer request with short note + description
- Then the tx is signed and sent automatically
- And the request is visible in Requests as Executed with tx signature

### Approval-required path

- Given a workspace with an agent and a spending limit that does NOT cover the transfer amount (or approval mode enabled)
- When the agent submits the same SOL transfer request
- Then an on-chain Squads proposal is created
- And the request is visible in Requests as Pending Approval
- When a human clicks Approve
- Then the proposal is approved/executed on-chain and request becomes Approved/Executed
- When a human clicks Deny
- Then the request becomes Denied and cannot be executed

### Error cases

- If Turnkey signing fails: request becomes Failed with error details
- If RPC fails / blockhash expired: request becomes Failed and UI shows “retry” only if safe
- If proposal creation fails: request becomes Failed
- If human approval fails due to missing permissions: show error and keep request Pending
- If request data is missing short note or description: validation error, no chain action

## Skills enabled (required)

- Solana vuln scan (trailofbits)
- Solana dev
- Convex
- Vercel React best practices
- TanStack Query
- TanStack Start best practices
- TanStack Router
- Squads
- Tailwind v4 + shadcn
- UI/UX Pro Max

## Done Conditions (hard gates)

- [ ] lint passes
- [ ] typecheck passes
- [ ] build passes
- [ ] tests pass (at least: unit tests for limit decision + request status transitions)
- [ ] request flow works in dev against a configured RPC
- [ ] completion marker written: DONE: CB-AGENT-SPEND-001 in docs/PROGRESS.md
