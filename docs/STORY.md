# STORY: 0020 Agent Connection Architecture (Turnkey + Workspace Binding)

## Team Deployment

Deploy Claude Code Agent Team (delegate mode ON):

- Lead / Architect
- PM/UX
- Backend
- QA

Frontend not required (only minimal UI notes).

Execute only this story until DONE.

## Inputs (only allowed files)

- docs/OVERVIEW.md
- docs/Potential_Architecture.md (uploaded)
- AGENTS/\*
- existing repo code (read-only, no implementation required)

## Scope (must)

Architecture + design only. No implementation. No SDK build.

### Deliverable A — Architecture spec file (required)

Create docs/ARCH_AGENT_CONNECT.md with:

1. Goals + non-goals (v1)
2. Trust boundaries + threat model (short)
3. Components:
   - Web App
   - Convex (DB + functions)
   - "Signing & Policy Service" (Convex actions)
   - Turnkey (agent wallet custody/sign)
   - Squads (multisig + spending limits)
   - Agent Runtime (OpenClaw / Claude Code / headless bot)
4. Data model (conceptual):
   - workspace
   - agent
   - agentWallet
   - agentSession / agentToken
   - spendingLimit binding
   - audit log / activity
     (Do not change DB schema in code; just describe entities + indexes needed.)
5. End-to-end flows (sequence steps):
   F1) Add Agent (human clicks "Add agent")
   F2) Create Turnkey wallet (or alternative) and store pubkey
   F3) Bind agent to workspace (DB + on-chain membership)
   F4) Install/run agent runtime and authenticate to workspace
   F5) Agent requests spend (tx intent) -> policy gate -> sign -> broadcast
   F6) Over-limit path -> proposal created -> humans approve
6. API contracts (Convex):
   - mutations/queries/actions names + inputs/outputs
   - auth requirements for each
7. Key management:
   - what secrets live where (Convex env, agent runtime env)
   - rotation story
8. Spending limits enforcement plan:
   - what is enforced in Squads vs backend policy gate
   - how to prevent bypass (agent cannot sign directly)
9. Failure modes + deterministic recovery:
   - Turnkey down
   - RPC down
   - stale spending limits
   - replay prevention for agent requests

### Deliverable B — Installation + bootstrap plan (required)

Create docs/AGENT_INSTALL.md with:

- Supported runtimes (OpenClaw / Claude Code)
- What runs where (user machine vs VPS)
- Install steps (high-level, deterministic)
- Required environment variables
- How workspace connection happens:
  - one-time connect code / link / JWT / signed challenge
  - how agent proves control of Turnkey wallet (or proves identity)

### Deliverable C — Minimal UI microcopy/spec (required)

PM/UX writes docs/UX_AGENT_CONNECT.md:

- Add Agent button placement
- Modal steps (just text, no design)
- What user sees after success (agent status, budget, last activity)
- Error messages and empty states

### Deliverable D — Security review checklist (required)

QA writes docs/SECURITY_AGENT_CONNECT.md:

- checklist for secret handling + logging
- auth + replay prevention
- principle of least privilege
- abuse/rate limiting
- “happy-path demo protection” rules

## Constraints

- Must align with product overview agent model:
  - Turnkey agent wallet
  - added as Squads member
  - spending limits gating autonomy
- Must align with architecture trust boundaries diagram:
  - Convex as coordination
  - server-side policy/signing service calls Turnkey sign and RPC broadcast
- Must be detailed enough that next implementation story is trivial.

## Out of scope (must not)

- Implement Turnkey SDK integration
- Implement Add Agent UI
- Implement proposal creation
- Implement spending limit creation
- Any code changes besides new docs files

## Done Conditions

- docs/ARCH_AGENT_CONNECT.md created
- docs/AGENT_INSTALL.md created
- docs/UX_AGENT_CONNECT.md created
- docs/SECURITY_AGENT_CONNECT.md created
- QA review notes included
- DONE: 0020 written to docs/PROGRESS.md
