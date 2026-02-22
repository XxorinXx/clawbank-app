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
