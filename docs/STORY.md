# STORY: 001B Privy Auth + Convex User + Workspace View

## Team Deployment

Lead must:

1. Deploy Claude Code Agent Team:
   - lead (delegate mode ON)
   - pmux
   - frontend
   - backend
   - qa
2. Use shared task list.
3. Execute only this story until DONE.

## Skills enabled

Backend:

- https://skills.sh/waynesutton/convexskills/convex
- https://skills.sh/waynesutton/convexskills/convex-best-practices
- https://skills.sh/waynesutton/convexskills/convex-schema-validator
- https://skills.sh/waynesutton/convexskills/convex-eslint

Frontend:

- https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices
- https://skills.sh/jezweb/claude-skills/tanstack-query
- https://skills.sh/jezweb/claude-skills/tanstack-router
- https://skills.sh/jezweb/claude-skills/tailwind-v4-shadcn
- https://skills.sh/nextlevelbuilder/ui-ux-pro-max-skill/ui-ux-pro-max

QA:

- none

## Inputs (only allowed files)

- docs/PRD.md
- docs/ACCEPTANCE.md
- AGENTS/\*
- scripts/checks.sh
- existing frontend scaffold from 001A

Workspaces empty state (Frontend)

On /workspaces, when user has no workspaces, show a centered container:

rectangle “card” with plus icon field

warm welcoming title + subtitle

Two buttons:

Primary: “Create workspace”

Secondary text button: “Import workspace”

for now shows toast: “Coming soon”

Create Workspace modal (Frontend)

Primary opens modal with 2-step flow and motion transition:

Step 1: workspace name

Step 2: add human members UI (email OR wallet)

add/remove members

basic validation (invalid email/wallet inline)

Final CTA: “Create workspace”

calls backend to create a real Squads multisig (dev/testing)

Convex auth wiring (Frontend)

Use existing ConvexProvider + PrivyProvider

Ensure Convex calls are authenticated via Privy access token

Backend (Convex + Squads + Solana)

Backend must implement Create Workspace end-to-end:

Accept: workspace name + member list (email/wallet)

Resolve member identities for multisig creation:

Wallet entries are used directly

Email entries are stored as “invited/pending” (no on-chain member unless it has a wallet)

Create Squads multisig using:

@sqds/multisig

@solana/web3.js ^1.98.4

@solana/spl-token (only if needed)

Use sponsor private key from Convex env to pay fees and sign sponsor-required instructions.

Must store enough data to support:

querying user workspaces

querying workspace members

later activity/requests indexing

Backend designs schema for good indexing/querying (no schema dictated here), but must include:

workspace identity (multisig address)

creator user reference

members/invites

timestamps

network/cluster (mainnet only)

Security constraints (even for testing)

Never log the sponsor key.

Never return sponsor key to frontend.

Rate limit / basic abuse guard: one workspace creation per user per N seconds (simple).

Fail with explicit errors (deterministic).

QA (must)

Run ./scripts/checks.sh

Edge cases ≥ 3:

empty name

invalid wallet

duplicate members

Security checks ≥ 2:

create-workspace endpoint requires auth

sponsor key never logged/exposed

Verify happy-path:

modal flow works

clicking “Create workspace” results in a multisig address displayed/stored and user sees the new workspace

Out of scope (must not)

Import workspace logic (still toast only)

Spending limits configuration UX

Agent wallets / Turnkey agent integration

Transaction requests/approvals UI

Advanced multisig config beyond minimal viable

UX + Acceptance (objective)

Empty state container renders and feels welcoming

Secondary text button shows “Coming soon”

Modal 2-step motion works

Members add/remove + validation works

Create workspace succeeds and results in:

workspace appears in /workspaces

shows multisig address (and basic metadata)

Checks pass; QA notes written; DONE marker written

- lint passes
- typecheck passes
- build passes
- tests pass or explicitly recorded
- QA notes written
- `DONE: 001C` written to docs/PROGRESS.md
