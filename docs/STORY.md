# STORY: 0021 Add Agent + Turnkey Wallet + Terminal Connect (MVP)

## Team Deployment

Deploy Claude Code Agent Team (delegate mode ON):

- Lead / Architect
- PM/UX
- Frontend
- Backend
- QA

Lead may and is recommended to spawn extra specialist subagents if needed (Turnkey/Solana/Security).

Use shared task list.
Execute only this story until DONE.

## Inputs (must read)

- docs/ARCH_AGENT_CONNECT.md
- docs/UX_AGENT_CONNECT.md
- docs/SECURITY_AGENT_CONNECT.md
- docs/AGENT_INSTALL.md (edit: terminal-only install)
- existing workspace + squads code

## Scope (must)

### Gate 0 — Terminal install only (doc change)

Update docs/AGENT_INSTALL.md:

- Remove npm package publishing assumptions (no @clawbank/cli package yet).
- Replace with local repo runnable command, e.g.:
  - `pnpm clawbank:connect` or `node scripts/agent/connect.mjs`
- Keep: connect code → token saved to .env → agent can call backend.
  (Installation is terminal-only for v1.)

QA must verify doc matches actual command.

### A) Backend — Turnkey provisioning + agent records

Implement server-side Turnkey integration (no private keys):

- Convex env:
  - TURNKEY_API_PUBLIC_KEY / TURNKEY_API_PRIVATE_KEY (or stamp method)
  - TURNKEY_ORG_ID (if required)
  - RPC_URL
- Create agent record via human-auth mutation:
  - `agents.create({ workspaceId, name, budget }) -> { agentId }`
  - Sets agent.status="provisioning" and schedules provision action.
- Provision action:
  - creates Turnkey wallet for agent
  - stores turnkeyWalletId + publicKey
  - generates connect code (short TTL)
  - returns connect code for UI display OR stores it retrievable once
- Persist sessions as HASHED secrets only (connect codes + session tokens hashed).
- Add agent-scoped auth for HTTP actions:
  - `auth.exchangeConnectCode({ connectCode }) -> { sessionToken, agentId, workspaceId, expiresAt }`

Security requirements:

- never log Turnkey credentials
- never store raw tokens in DB (hash only)
- rate limit:
  - connect-code generation per workspace
  - exchange attempts per IP/agent
- deterministic errors

### B) Frontend — Add Agent modal (3 steps) + connect code display

Implement UI per UX spec:

- Entry points:
  - Agents tab: "Add Agent" CTA
  - Workspace header: "Connect Agent"
- Modal:
  Step 1: name + budget (token+amount+period)
  Step 2: connect code display (with expiry countdown)
  Step 3: success
- Step 2 must show terminal command (copy button).
- When backend reports “agent connected” (token exchanged), auto-advance to Done.

(Use realtime subscription/query polling—backend chooses. Must be deterministic.)

### C) Terminal connect command (repo-local CLI)

Implement a minimal terminal command (no publishing):

- Prompts for connect code OR accepts as argument.
- Calls backend `auth.exchangeConnectCode`.
- Writes `.env` in CWD:
  - CLAWBANK_API_URL=<convex deployment URL>
  - CLAWBANK_AGENT_TOKEN=<token>
- Never prints token after writing.
- Explicit ✓/✗ output.
- Retry logic: 2 attempts then stop.

### D) Agent status endpoint (minimal)

Implement HTTP action:

- `agent.status({ sessionToken }) -> { agentId, workspaceId, status, limits }`

This is needed for CLI “Connected ✓” verification.

### E) QA (must)

- Run ./scripts/checks.sh
- Verify:
  - happy path: create agent → connect code → terminal connect writes .env → status returns active
  - connect code single-use + expiry
  - token is not logged / not stored raw
  - revoke/disable basic path (can be stubbed but must exist as non-dangerous toggle)
- Edge cases ≥ 6:
  - expired code
  - reused code
  - Turnkey API failure
  - workspace unauthorized create
  - missing budget fields
  - CLI run outside repo (no .env write perms)

## Out of scope (must not)

- Spend.request implementation (keep stubbed)
- Squads member add/remove proposals unless already required for “active” (if required, do minimal viable)
- npm package publishing
- multi-runtime installers (only terminal)

## Done Conditions (hard gates)

- Gate 0 doc updated and matches real CLI command
- Add Agent modal works end-to-end
- Turnkey wallet created and publicKey stored
- Connect code exchange produces session token; token saved to .env via terminal command
- agent.status works using token
- lint/typecheck/build/tests pass
- QA notes written
- DONE: 0021 written to docs/PROGRESS.md
