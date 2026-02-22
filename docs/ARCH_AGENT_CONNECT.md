# ClawBank — Agent Connect Architecture (v1)

## 1. Goals & Non-Goals

### Goals (v1)

- **Add Agent flow**: Human workspace owner adds an AI agent via a simple modal (name + budget).
- **Turnkey wallet provisioning**: Each agent gets a dedicated Solana wallet via Turnkey, with no raw private key exposure.
- **Squads membership**: Agent public key is added as a Squads multisig member via a proposal.
- **Spending limits**: Per-agent, per-token budget enforced in the backend policy gate before signing.
- **Session tokens**: Agents authenticate with a one-time connect code exchanged for a scoped session token.
- **Autonomous spend**: Under-limit transactions are signed by Turnkey and broadcast without human approval.
- **Over-limit proposals**: Transactions exceeding limits create Squads proposals requiring human approval.
- **Activity log**: Every agent action (spend, auth, limit breach) is recorded in Convex for auditability.

### Non-Goals (deferred)

- Destination allowlists / recipient restrictions.
- Advanced policy rules (time-of-day, velocity, multi-token aggregate caps).
- Agent-to-agent delegation or sub-budgets.
- Deep on-chain indexing or historical replay.
- Multi-chain support.
- Agent SDK / npm package (v1 agents call Convex HTTP actions directly).
- On-chain spending-limit enforcement (Squads program-level limits are future work; v1 enforces in backend).

---

## 2. Trust Boundaries & Threat Model

### Trust Boundaries

| Boundary | Trusts | Does NOT Trust |
|---|---|---|
| **Web App (Human)** | Privy session, Convex realtime | Agent runtimes, raw RPC responses |
| **Agent Runtime** | Its own session token, Convex API | Nothing else; it has no signing capability |
| **Convex (DB + Functions)** | Privy-verified identity tokens, Turnkey API responses | Agent runtime claims (must validate session), unsigned data from frontend |
| **Signing & Policy Service** (Convex actions) | Convex DB state (spending limits, agent records), Turnkey signing API | Agent-supplied amounts/destinations (must re-validate against policy) |
| **Turnkey** | Authenticated API calls from Signing Service (API key + stamp) | Everything else; it only signs when told to |
| **Squads (on-chain)** | Valid signatures matching registered members + thresholds | All off-chain state |

### Key Threats

| Threat | Mitigation |
|---|---|
| **Stolen session token** | Tokens are SHA-256 hashed before storage; short TTL (24h); bound to single agent; revocable by human |
| **Policy bypass (agent submits tx directly to RPC)** | Agent has no private key access — Turnkey signs only via Signing Service. Even if agent broadcasts a self-crafted tx, it cannot sign it. |
| **Backend compromise (Convex)** | Turnkey API key has scoped permissions (sign-only, no export). Squads threshold still requires human approval for config changes. |
| **Replay attack** | Each transaction uses a unique Solana recent blockhash (expires ~60s). Activity log records tx signatures for dedup. |
| **Stale limit reads** | Spending limit check + spend recording happen atomically in a single Convex mutation (serializable isolation). |
| **Turnkey compromise** | Turnkey uses secure enclaves; keys are non-exportable. Squads multisig threshold means a single compromised signer cannot change governance. |

---

## 3. Components

### 3.1 Web App (React + Vite + TypeScript)

- Human-facing SPA authenticated via Privy.
- Renders workspace dashboard, agent list, approval requests.
- Calls Convex mutations/queries over WebSocket (realtime).
- Initiates "Add Agent" flow via modal UI.
- Never touches Turnkey or agent sessions directly.

### 3.2 Convex (DB + Functions + Realtime)

- **Database**: Stores all application state (users, workspaces, agents, sessions, spending limits, activity log).
- **Queries**: Read-only functions for UI subscriptions (agent list, balances, activity feed).
- **Mutations**: Transactional writes (create agent record, record spend, rotate session).
- **Actions**: Side-effectful operations that call external APIs (Turnkey, Helius RPC, Squads instructions).
- Provides serializable isolation for atomic limit checks.

### 3.3 Signing & Policy Service (Convex Actions)

Runs as Convex actions (server-side, not client-callable except through mutations that gate access):

1. **Validates** the request against spending limits (reads DB).
2. **Constructs** the Solana transaction (transfer, swap instruction, or Squads proposal).
3. **Calls Turnkey** to sign the transaction with the agent's key.
4. **Broadcasts** the signed transaction via Helius RPC.
5. **Records** the result in the activity log.

### 3.4 Turnkey (Agent Wallet Custody)

- External service; accessed via REST API with API-key + request stamping.
- Creates Solana wallets scoped to individual agents.
- Signs transaction payloads on request — keys never leave Turnkey's secure enclave.
- No spending logic; purely a signing oracle.

### 3.5 Squads v4 (On-chain Multisig + Vault)

- Holds workspace funds in a program-derived vault.
- Manages member list and approval thresholds.
- Processes proposals for over-limit spends and config changes.
- Source of truth for on-chain membership and vault balances.

### 3.6 Agent Runtime (External)

- Third-party or user-built automation (trading bot, payment agent, etc.).
- Headless process; authenticates to ClawBank via connect code → session token.
- Submits spend intents to Convex HTTP actions; never signs transactions itself.
- Stateless from ClawBank's perspective — all state lives in Convex.

---

## 4. Data Model (Conceptual)

These four new tables extend the existing schema. All IDs are Convex document IDs.

### 4.1 `agents`

Represents a registered AI agent within a workspace.

| Field | Type | Description |
|---|---|---|
| `workspaceId` | `Id<"workspaces">` | Parent workspace |
| `name` | `string` | Human-readable label (e.g., "My Trading Bot") |
| `turnkeyWalletId` | `string` | Turnkey wallet resource ID |
| `publicKey` | `string` | Solana public key (base58) derived from Turnkey wallet |
| `status` | `string` | `"provisioning"` → `"active"` → `"paused"` / `"revoked"` |
| `createdAt` | `number` | Unix timestamp (ms) |

**Indexes:**
- `by_workspace` → `[workspaceId]` — list agents in a workspace.
- `by_publicKey` → `[publicKey]` — look up agent by on-chain address.

### 4.2 `agent_sessions`

Short-lived session tokens for agent runtime authentication.

| Field | Type | Description |
|---|---|---|
| `agentId` | `Id<"agents">` | Owning agent |
| `tokenHash` | `string` | SHA-256 hash of the bearer token (raw token never stored) |
| `expiresAt` | `number` | Unix timestamp (ms); default TTL = 24 hours |
| `lastUsedAt` | `number` | Updated on each authenticated request |

**Indexes:**
- `by_tokenHash` → `[tokenHash]` — fast session lookup on every request.
- `by_agentId` → `[agentId]` — list/revoke all sessions for an agent.

### 4.3 `spending_limits`

Per-agent, per-token budgets with rolling period tracking.

| Field | Type | Description |
|---|---|---|
| `workspaceId` | `Id<"workspaces">` | Workspace scope |
| `agentId` | `Id<"agents">` | Agent this limit applies to |
| `tokenMint` | `string` | SPL token mint address (or `"SOL"` for native) |
| `limitAmount` | `number` | Maximum spend allowed per period (in token base units) |
| `spentAmount` | `number` | Spend accumulated in the current period |
| `periodType` | `string` | `"daily"` / `"weekly"` / `"monthly"` |
| `periodStart` | `number` | Unix timestamp (ms) when current period began |

**Indexes:**
- `by_agent_token` → `[agentId, tokenMint]` — look up a specific limit.
- `by_workspace` → `[workspaceId]` — list all limits for a workspace.

### 4.4 `activity_log`

Immutable audit trail of all agent actions.

| Field | Type | Description |
|---|---|---|
| `workspaceId` | `Id<"workspaces">` | Workspace scope |
| `agentId` | `Id<"agents">` | Acting agent |
| `action` | `string` | `"spend"`, `"spend_rejected"`, `"proposal_created"`, `"session_created"`, `"session_revoked"`, `"agent_paused"` |
| `txSignature` | `string` (optional) | Solana transaction signature, if applicable |
| `amount` | `number` (optional) | Token amount involved |
| `tokenMint` | `string` (optional) | Token mint of the transaction |
| `metadata` | `object` (optional) | Arbitrary JSON for additional context (error reason, proposal ID, etc.) |
| `timestamp` | `number` | Unix timestamp (ms) |

**Indexes:**
- `by_workspace` → `[workspaceId]` — workspace activity feed.
- `by_agent` → `[agentId]` — per-agent activity history.
- `by_txSignature` → `[txSignature]` — dedup and lookup by on-chain signature.

---

## 5. End-to-End Flows

### F1: Add Agent (Human UI)

```
1. Human clicks "Connect Agent" on workspace page.
2. Modal opens → human enters: name, budget (token + amount + period).
3. Frontend calls mutation `agents.create({ workspaceId, name, budget })`.
4. Mutation validates human is workspace creator/member with admin rights.
5. Mutation inserts agent record with status = "provisioning".
6. Mutation schedules action `agents.provision` (async, returns immediately to UI).
7. UI shows agent card in "provisioning" state (realtime subscription).
```

### F2: Create Turnkey Wallet

```
1. Action `agents.provision` fires (server-side).
2. Action calls Turnkey API: POST /wallets → create new Solana wallet.
   - Params: organizationId, walletName = "clawbank-agent-{agentId}".
3. Turnkey returns: walletId, Solana address (public key).
4. Action calls mutation to update agent record:
   - turnkeyWalletId = walletId
   - publicKey = address
   - status stays "provisioning" (still need Squads binding).
5. Action proceeds to F3.
```

### F3: Bind Agent to Workspace (Squads Membership)

```
1. Action constructs a Squads `addMember` instruction:
   - multisig = workspace.multisigAddress
   - newMember = agent.publicKey
   - creator = user's Privy wallet (the human who initiated the flow)
   - permissions = Voter (can sign proposals) + Executor (can execute approved txs)
2. Action wraps the instruction in a Squads proposal (since adding members requires threshold approval).
3. Action builds the transaction with the sponsor wallet as fee payer (`payerKey` / `rentPayer`)
   and the user's Privy wallet as the proposal creator/member.
4. Action partial-signs the transaction with the sponsor keypair.
5. Action returns the serialized, partially-signed transaction to the frontend.
6. Frontend prompts the user to sign with their Privy wallet.
7. Frontend submits the fully-signed transaction back to the backend, which broadcasts via Helius RPC.
8. If workspace threshold = 1 (single signer), proposal auto-executes. Otherwise, humans approve in the Requests tab.
9. On on-chain confirmation, action calls mutation:
   - agent.status = "active"
   - Insert spending_limits record(s) from the budget specified in F1.
   - Insert activity_log entry: action = "agent_created".
10. Action generates a one-time connect code (random 32-byte hex), stores hash in agent_sessions (short TTL = 10 min).
11. UI displays connect code to human (copy-to-clipboard). Human gives this to the agent operator.
```

> **Note**: The sponsor wallet is never a multisig member. It only pays transaction fees.
> All proposal creation and approval requires the user's Privy wallet signature (build-then-user-signs pattern).

### F4: Agent Runtime Authenticates

```
1. Agent runtime receives connect code out-of-band from human.
2. Agent calls HTTP action `auth.exchangeConnectCode({ connectCode })`.
3. Action hashes the code with SHA-256, looks up agent_sessions by tokenHash.
4. If found and not expired:
   a. Generate a new session token (random 32-byte hex).
   b. Store SHA-256(sessionToken) in a new agent_sessions row with 24h TTL.
   c. Delete the connect-code session row (one-time use).
   d. Return { sessionToken, agentId, publicKey, expiresAt }.
5. If not found or expired → 401 Unauthorized.
6. Agent stores sessionToken in memory; includes it in Authorization header on subsequent calls.
```

### F5: Agent Requests Spend (Under Limit)

```
1. Agent calls HTTP action `spend.request({ sessionToken, tokenMint, amount, destination })`.
2. Action authenticates session:
   a. Hash sessionToken, look up agent_sessions by tokenHash.
   b. Validate not expired, update lastUsedAt.
   c. Load agent record, verify status = "active".
3. Action loads spending_limits for (agentId, tokenMint).
4. Period check: if now > periodStart + periodDuration, reset spentAmount = 0, periodStart = now.
5. Budget check: if spentAmount + amount <= limitAmount → APPROVED.
6. Mutation atomically: spentAmount += amount (optimistic lock via Convex serialization).
7. Action constructs Solana transfer instruction (SPL or native SOL).
8. Action calls Turnkey: sign transaction with agent's wallet.
9. Action broadcasts signed tx via Helius RPC.
10. Action waits for confirmation (poll tx status, max 30s).
11. Mutation records activity_log: action = "spend", txSignature, amount, tokenMint.
12. Return { success: true, txSignature } to agent runtime.
```

### F6: Over-Limit Path (Proposal Flow)

```
1. Steps 1–4 same as F5.
2. Budget check: spentAmount + amount > limitAmount → OVER LIMIT.
3. Action does NOT increment spentAmount.
4. Action constructs a Squads proposal:
   - Proposal contains the transfer instruction.
   - Memo includes: agentId, requested amount, current limit.
5. Action signs the proposal-creation tx via Turnkey (agent's key).
6. Action broadcasts via Helius RPC.
7. Mutation records activity_log: action = "proposal_created", metadata = { proposalAddress, amount }.
8. Return { success: false, reason: "over_limit", proposalAddress } to agent runtime.
9. Proposal appears in the workspace Requests tab (realtime).
10. Human(s) approve or reject the proposal through the Squads flow.
11. If approved and executed on-chain, a follow-up Convex action detects the execution and logs activity_log: action = "spend" with the final txSignature.
```

---

## 6. API Contracts (Convex)

### Mutations (require Privy auth — human callers)

| Function | Inputs | Output | Auth | Description |
|---|---|---|---|---|
| `agents.create` | `{ workspaceId, name, budget: { tokenMint, limitAmount, periodType } }` | `{ agentId }` | Privy token; must be workspace admin | Creates agent record (provisioning), schedules provision action |
| `agents.pause` | `{ agentId }` | `{ success }` | Privy; workspace admin | Sets agent status to "paused"; all spend requests will reject |
| `agents.revoke` | `{ agentId }` | `{ success }` | Privy; workspace admin | Sets status to "revoked"; deletes active sessions; creates Squads removal proposal |
| `agents.updateLimit` | `{ agentId, tokenMint, limitAmount, periodType }` | `{ success }` | Privy; workspace admin | Updates or inserts a spending_limits row |
| `agents.generateConnectCode` | `{ agentId }` | `{ connectCode, expiresAt }` | Privy; workspace admin | Creates a short-lived connect code for agent auth |

### Queries (require Privy auth — human callers)

| Function | Inputs | Output | Auth | Description |
|---|---|---|---|---|
| `agents.list` | `{ workspaceId }` | `Agent[]` | Privy; workspace member | Lists all agents with status and public key |
| `agents.get` | `{ agentId }` | `Agent \| null` | Privy; workspace member | Full agent details |
| `spendingLimits.list` | `{ workspaceId }` | `SpendingLimit[]` | Privy; workspace member | All spending limits for the workspace |
| `spendingLimits.getByAgent` | `{ agentId }` | `SpendingLimit[]` | Privy; workspace member | Limits for a specific agent |
| `activityLog.list` | `{ workspaceId, limit?, cursor? }` | `{ entries: ActivityLogEntry[], cursor }` | Privy; workspace member | Paginated activity feed |
| `activityLog.listByAgent` | `{ agentId, limit?, cursor? }` | `{ entries: ActivityLogEntry[], cursor }` | Privy; workspace member | Agent-specific activity |

### HTTP Actions (agent runtime callers — session token auth)

| Function | Inputs | Output | Auth | Description |
|---|---|---|---|---|
| `auth.exchangeConnectCode` | `{ connectCode }` | `{ sessionToken, agentId, publicKey, expiresAt }` | None (code is the credential) | Exchange one-time code for session token |
| `spend.request` | `{ sessionToken, tokenMint, amount, destination }` | `{ success, txSignature? }` or `{ success: false, reason, proposalAddress? }` | Session token | Submit a spend intent; returns tx sig or proposal |
| `agent.status` | `{ sessionToken }` | `{ agentId, status, limits: SpendingLimit[] }` | Session token | Agent queries its own status and remaining limits |
| `agent.activity` | `{ sessionToken, limit?, cursor? }` | `{ entries: ActivityLogEntry[], cursor }` | Session token | Agent queries its own activity log |

### Internal Actions (called by mutations, not externally accessible)

| Function | Description |
|---|---|
| `agents.provision` | Creates Turnkey wallet + binds to Squads (F2 + F3) |
| `spend.execute` | Signs and broadcasts a validated transaction via Turnkey + Helius |
| `proposals.detect` | Polls or subscribes to Squads proposal state for completion callbacks |

---

## 7. Key Management

### Secrets Inventory

| Secret | Location | Access | Rotation |
|---|---|---|---|
| **Turnkey API key + stamp key** | Convex environment variables | Signing & Policy Service (Convex actions) only | Rotate via Turnkey dashboard; update Convex env var; zero-downtime (old key valid for overlap window) |
| **Privy app secret** | Convex environment variables | Auth middleware in Convex functions | Rotate via Privy dashboard + Convex env var |
| **Helius API key** | Convex environment variables | Actions that broadcast transactions | Rotate via Helius dashboard + Convex env var |
| **Agent session tokens** | In-memory on agent runtime; SHA-256 hash in Convex DB | Agent runtime (raw), Convex (hashed) | Auto-expire after 24h; humans can revoke anytime |
| **Connect codes** | Displayed once in UI; SHA-256 hash in Convex DB | Human (raw, one-time view), Convex (hashed) | Single-use; expire after 10 minutes |

### What We Never Store

- Turnkey private keys (hardware enclave only).
- Privy embedded wallet keys (Privy-managed).
- Raw session tokens or connect codes (only hashes).

### Rotation Playbook

1. Generate new credential in the provider's dashboard.
2. Set the new value as a Convex environment variable (new deployment picks it up).
3. Old credential remains valid for a grace period (provider-dependent).
4. Remove old credential from the provider after confirming the new one works.

---

## 8. Spending Limits Enforcement

### Enforcement Layers

| Layer | What It Enforces | How |
|---|---|---|
| **Backend Policy Gate** (Convex mutation + action) | Per-agent, per-token, per-period budget | Atomic read-check-write on `spending_limits.spentAmount` inside a Convex mutation. If `spentAmount + requestAmount > limitAmount`, reject. |
| **Squads v4** (on-chain) | Multisig threshold for proposals; member permissions | Over-limit spends are wrapped in proposals that require human approval signatures on-chain. Config changes (add/remove members, change threshold) always require proposals. |

### Why Backend-First (v1)

- Squads v4 does not natively support per-member per-token rolling spending limits. It supports proposal thresholds and member permissions, but not fine-grained budget tracking.
- The backend policy gate provides the granularity we need (per-agent, per-token, per-period) with immediate enforcement.
- On-chain enforcement is a future improvement once Squads exposes programmable spending limits or we build a custom program.

### Bypass Prevention

| Attack Vector | Defense |
|---|---|
| Agent submits tx directly to RPC | Agent has no private key — only Turnkey can sign, and Turnkey only signs requests from the Signing Service (API-key authenticated). |
| Agent calls Turnkey directly | Turnkey API key is only in Convex env vars; agent runtime never has access. |
| Race condition: two concurrent spend requests exceed limit | Convex mutations run in serializable isolation. Two concurrent mutations on the same `spending_limits` row are serialized; the second one sees the updated `spentAmount`. |
| Manipulated amount in request | Signing Service constructs the Solana instruction itself from the validated amount; it does not sign agent-provided raw transaction bytes. |
| Stale period: spend in expired period counts against new period | Period reset logic runs at the start of every spend check: if `now > periodStart + periodDuration`, reset `spentAmount = 0` and `periodStart = now`. |

---

## 9. Failure Modes & Deterministic Recovery

### FM1: Turnkey API Unavailable

| Aspect | Detail |
|---|---|
| **Symptom** | `agents.provision` or `spend.execute` action fails on Turnkey call |
| **Impact** | New agent wallets cannot be created; active agents cannot spend |
| **Recovery** | Action retries with exponential backoff (3 attempts, 1s/2s/4s). If all fail, mutation marks the operation as `"failed"` in activity_log. For provision: agent stays in `"provisioning"` status; UI shows retry button. For spend: return error to agent runtime; agent can retry. No funds at risk — nothing was signed. |

### FM2: Helius RPC Unavailable

| Aspect | Detail |
|---|---|
| **Symptom** | Transaction broadcast or confirmation polling fails |
| **Impact** | Signed transactions cannot be submitted or confirmed |
| **Recovery** | If broadcast fails: retry up to 3 times. The signed transaction is idempotent (same signature). If confirmation polling times out (30s): return `{ success: "pending", txSignature }` to caller. A scheduled Convex action (`proposals.detect`) will poll for finality and update the activity log when confirmed. Spending limit is already decremented optimistically; if the tx ultimately fails on-chain, a reconciliation action reverses the `spentAmount`. |

### FM3: Stale Spending Limits

| Aspect | Detail |
|---|---|
| **Symptom** | Limits diverge from on-chain reality (e.g., manual on-chain transfer not tracked) |
| **Impact** | Agent could underspend or overspend relative to true vault balance |
| **Recovery** | v1 scope: all vault spends go through ClawBank, so limits stay synchronized. Manual on-chain transactions (outside ClawBank) are not tracked in v1. Future: periodic reconciliation action compares vault balance against cumulative activity_log spends and flags discrepancies to humans. |

### FM4: Replay Prevention

| Aspect | Detail |
|---|---|
| **Symptom** | Malicious agent replays a previously successful spend request |
| **Impact** | Double-spend against the budget |
| **Recovery** | Each Solana transaction includes a `recentBlockhash` that expires after ~60 seconds. Even if the same request parameters are submitted, a new transaction is built with a fresh blockhash — so there is no byte-level replay. The spending limit deduction is atomic and idempotent per transaction build. The activity_log `by_txSignature` index enables dedup at the recording layer. |

### FM5: Agent Session Compromise

| Aspect | Detail |
|---|---|
| **Symptom** | Attacker obtains a valid session token |
| **Impact** | Attacker can spend up to the agent's remaining budget |
| **Recovery** | Spending limits cap the blast radius. Human can immediately call `agents.pause` or `agents.revoke` to freeze all spend and delete sessions. Session TTL (24h) bounds the exposure window. Activity log provides full audit trail for forensic review. |

### FM6: Partial Provision Failure

| Aspect | Detail |
|---|---|
| **Symptom** | Turnkey wallet created but Squads membership proposal fails |
| **Impact** | Agent record exists with a wallet but no on-chain membership |
| **Recovery** | Agent stays in `"provisioning"` status (cannot authenticate or spend). Workspace admin sees a "Retry" button that re-triggers the `agents.provision` action. The action is idempotent: if wallet already exists, it skips creation and retries only the Squads binding. Orphaned Turnkey wallets have no funds and no signing authority, so they are inert. |
