# ClawBank — Full Technical Documentation

> AI-agent banking layer on Solana. Humans create smart account vaults (Squads Smart Account Program), connect AI agents with bounded spending limits. Agents transfer SOL autonomously within budgets; over-budget transfers require human approval via on-chain proposals.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Database Schema](#4-database-schema)
5. [On-Chain Program Integration](#5-on-chain-program-integration)
6. [Transaction Building (Build-then-Sign)](#6-transaction-building-build-then-sign)
7. [Backend Actions](#7-backend-actions)
8. [Backend Queries & Mutations](#8-backend-queries--mutations)
9. [Internal Helpers](#9-internal-helpers)
10. [Library Modules](#10-library-modules)
11. [HTTP API (SDK Endpoints)](#11-http-api-sdk-endpoints)
12. [Agent Authentication (DPoP v2)](#12-agent-authentication-dpop-v2)
13. [Agent SDK (`@clawbank/sdk`)](#13-agent-sdk-clawbanksdk)
14. [Frontend](#14-frontend)
15. [Core Flows](#15-core-flows)
16. [Security Model](#16-security-model)
17. [Testing](#17-testing)
18. [Environment & Configuration](#18-environment--configuration)
19. [Key Architectural Decisions](#19-key-architectural-decisions)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        ClawBank System                          │
│                                                                 │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │  React App   │◄──►│  Convex Backend   │◄──►│   Solana      │  │
│  │  (Frontend)  │    │  (Functions + DB) │    │   Mainnet     │  │
│  └──────┬───────┘    └────────┬─────────┘    └───────────────┘  │
│         │                     │                                  │
│         │ Privy Auth          │ HTTP API                        │
│         │ Wallet Sign         │ (DPoP v2)                       │
│         │                     │                                  │
│  ┌──────┴───────┐    ┌───────┴──────────┐                       │
│  │  Privy v2    │    │  Agent SDK       │                       │
│  │  (Human Auth)│    │  (@clawbank/sdk) │                       │
│  └──────────────┘    └──────────────────┘                       │
│                                                                 │
│  External Services:                                             │
│  - Turnkey (agent wallet provisioning + signing)                │
│  - Jupiter API (token metadata + prices)                        │
│  - Squads Smart Account Program (on-chain vaults)               │
└─────────────────────────────────────────────────────────────────┘
```

**Data flow:** Humans interact via the React frontend (authenticated by Privy). AI agents interact via the SDK over 4 HTTP endpoints (authenticated by DPoP). All state lives in Convex (DB) and on Solana (smart accounts). Transactions are built server-side, signed client-side (build-then-sign pattern).

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TanStack Router, TanStack Query, Zustand, Tailwind CSS, shadcn/ui, Motion (Framer Motion) |
| **Backend** | Convex (serverless functions, real-time DB, cron jobs, HTTP endpoints) |
| **Human Auth** | Privy v2 (email/social login + embedded Solana wallet) |
| **Agent Auth** | Ed25519 DPoP (Demonstrating Proof of Possession) |
| **On-Chain** | Solana mainnet-beta, Squads Smart Account Program (`SMRTzfY6DfH5ik3TKiyLFfXexV8uSG3d2UksSCYdunG`) |
| **Agent Wallets** | Turnkey (programmatic Ed25519 wallet creation + signing) |
| **Token Data** | Jupiter API (metadata, prices) |
| **Testing** | Vitest (unit), Playwright (e2e) |
| **Build** | Vite, TypeScript 5.6 (strict) |

---

## 3. Project Structure

```
clawbank/                         # Parent folder (NOT a git repo)
├── clawbank-app/                 # Main repo (React + Convex)
│   ├── convex/                   # Backend
│   │   ├── _generated/           # Convex auto-generated types
│   │   ├── actions/              # 19 server actions (RPC, on-chain, external APIs)
│   │   ├── internals/            # 6 internal helper modules (DB operations)
│   │   ├── lib/                  # 7 library modules (tx builders, auth, rate limiting)
│   │   │   └── __tests__/        # Unit tests for tx builders, spending limits, atomicity
│   │   ├── mutations/            # 1 mutation file (agent CRUD)
│   │   ├── queries/              # 5 query files (workspaces, agents, requests, activity)
│   │   ├── schema.ts             # Database schema (12 tables)
│   │   ├── http.ts               # 4 HTTP endpoints for SDK
│   │   ├── crons.ts              # Scheduled jobs (DPoP nonce cleanup)
│   │   ├── env.ts                # Environment variable access
│   │   └── auth.config.ts        # Privy auth configuration
│   ├── src/                      # Frontend
│   │   ├── components/           # 27 React components
│   │   ├── hooks/                # 6 custom hooks
│   │   ├── routes/               # 3 TanStack Router routes
│   │   ├── providers/            # Convex + Privy providers
│   │   ├── utils/                # Formatting, animations, classnames
│   │   └── env.ts                # Zod-validated env vars
│   ├── e2e/                      # Playwright end-to-end tests
│   ├── AGENTS/                   # Agent conventions, safety rules, roles
│   ├── docs/                     # Documentation
│   │   ├── API_SURFACE.md        # SDK endpoint contract (source of truth)
│   │   ├── DECISIONS.md          # Architecture decisions
│   │   ├── PROGRESS.md           # Story completion tracking
│   │   ├── PRD.md                # Product requirements
│   │   └── FULL_DOCUMENTATION.md # This file
│   └── scripts/                  # Build/check scripts
└── clawbank-sdk/                 # Agent SDK repo (@clawbank/sdk)
    └── src/
        ├── client.ts             # ClawBank class (connect, load, transfer, status)
        ├── types.ts              # Public types
        ├── errors.ts             # Custom error classes
        ├── api/                  # HTTP transport + endpoint definitions
        └── auth/                 # DPoP, token management, keystore encryption
```

---

## 4. Database Schema

Convex database with 12 tables:

### `users`
| Field | Type | Description |
|-------|------|-------------|
| `email` | string | User's email from Privy |
| `walletAddress` | string | Solana public key (Privy embedded wallet) |
| `tokenIdentifier` | string | Privy token identifier (unique) |
| `createdAt` | number | Unix timestamp |

**Indexes:** `by_token(tokenIdentifier)`

### `workspaces`
| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Workspace display name |
| `settingsAddress` | string | Squads Smart Account settings PDA (base58) |
| `vaultAddress` | string | Squads Smart Account vault PDA (base58) |
| `creatorTokenIdentifier` | string | Creator's Privy token identifier |
| `createdAt` | number | Unix timestamp |

**Indexes:** `by_creator(creatorTokenIdentifier)`, `by_settings(settingsAddress)`

### `workspace_members`
| Field | Type | Description |
|-------|------|-------------|
| `workspaceId` | Id<"workspaces"> | Reference to workspace |
| `walletAddress` | string | Member's Solana public key |
| `role` | "creator" \| "member" | Member role |
| `addedAt` | number | Unix timestamp |

**Indexes:** `by_workspace(workspaceId)`, `by_wallet(walletAddress)`

### `workspace_invites`
| Field | Type | Description |
|-------|------|-------------|
| `workspaceId` | Id<"workspaces"> | Reference to workspace |
| `email` | string | Invitee's email |
| `status` | "pending" \| "accepted" \| "rejected" | Invite status |
| `invitedAt` | number | Unix timestamp |

**Indexes:** `by_workspace(workspaceId)`, `by_email(email)`

### `agents`
| Field | Type | Description |
|-------|------|-------------|
| `workspaceId` | Id<"workspaces"> | Reference to workspace |
| `name` | string | Agent display name |
| `turnkeyWalletId` | string? | Turnkey wallet identifier |
| `publicKey` | string? | Agent's Solana public key (base58) |
| `status` | string | "provisioning" \| "connected" \| "active" \| "paused" \| "revoked" |
| `connectCode` | string? | 6-char alphanumeric code (hashed) |
| `connectCodeExpiresAt` | number? | Code expiry timestamp |
| `authPublicKey` | string? | Ed25519 DPoP public key (base64url) |
| `createdAt` | number | Unix timestamp |

**Indexes:** `by_workspace(workspaceId)`, `by_publicKey(publicKey)`

### `agent_sessions`
| Field | Type | Description |
|-------|------|-------------|
| `agentId` | Id<"agents"> | Reference to agent |
| `tokenHash` | string | SHA-256 hash of session/access token |
| `expiresAt` | number | Token expiry timestamp |
| `lastUsedAt` | number | Last activity timestamp |
| `sessionType` | string | "connect_code" \| "session" \| "access" \| "refresh" |
| `authVersion` | number? | 1 (Bearer) or 2 (DPoP) |
| `refreshTokenFamily` | string? | Token family for reuse detection |
| `refreshSequence` | number? | Monotonic counter within family |

**Indexes:** `by_tokenHash(tokenHash)`, `by_agentId(agentId)`, `by_refreshFamily(refreshTokenFamily)`

### `spending_limits`
| Field | Type | Description |
|-------|------|-------------|
| `workspaceId` | Id<"workspaces"> | Reference to workspace |
| `agentId` | Id<"agents"> | Reference to agent |
| `tokenMint` | string | SPL token mint (or native SOL mint) |
| `limitAmount` | number | Max spend per period (in token units, e.g. SOL) |
| `spentAmount` | number | Amount spent in current period |
| `periodType` | "daily" \| "weekly" \| "monthly" | Reset period |
| `periodStart` | number | Current period start timestamp |
| `onchainCreateKey` | string? | Seed used for on-chain spending limit PDA |

**Indexes:** `by_agent_token(agentId, tokenMint)`, `by_workspace(workspaceId)`

### `transfer_requests`
| Field | Type | Description |
|-------|------|-------------|
| `agentId` | Id<"agents"> | Requesting agent |
| `workspaceId` | Id<"workspaces"> | Workspace |
| `recipient` | string | Destination Solana address |
| `amountLamports` | number | Transfer amount in lamports |
| `shortNote` | string | Agent's reason (1-80 chars) |
| `description` | string? | Longer explanation |
| `status` | string | "pending_execution" \| "executed" \| "pending_approval" \| "approved" \| "denied" \| "failed" |
| `spendingLimitSnapshot` | object? | Snapshot of limit at request time |
| `txSignature` | string? | On-chain transaction signature |
| `proposalAddress` | string? | Squads proposal PDA (for over-limit) |
| `proposalIndex` | number? | Transaction index in smart account |
| `errorMessage` | string? | Error details if failed |
| `createdAt` | number | Request timestamp |
| `updatedAt` | number | Last status change |

**Indexes:** `by_workspace(workspaceId)`, `by_agent(agentId)`

### `activity_log`
| Field | Type | Description |
|-------|------|-------------|
| `workspaceId` | Id<"workspaces"> | Workspace |
| `agentId` | Id<"agents">? | Agent (if agent-initiated) |
| `actorType` | "agent" \| "human" | Who performed the action |
| `actorLabel` | string | Email or agent name |
| `category` | "transaction" \| "config" \| "agent_lifecycle" | Action category |
| `action` | string | Specific action (e.g. "transfer_executed", "agent_activated") |
| `txSignature` | string? | On-chain signature |
| `amount` | number? | Amount in lamports |
| `tokenMint` | string? | Token mint address |
| `metadata` | object? | Additional context (recipient, usdValue, agentName, etc.) |
| `timestamp` | number | When it happened |

**Indexes:** `by_workspace(workspaceId)`, `by_agent(agentId)`, `by_txSignature(txSignature)`

### `token_metadata_cache`
Caches token symbol, name, icon, and decimals from Jupiter API. 24-hour TTL.

**Indexes:** `by_mint(mint)`

### `token_price_cache`
Caches token USD prices from Jupiter Price API. 60-second TTL.

**Indexes:** `by_mint(mint)`

### `dpop_nonces`
Stores DPoP JWT `jti` claims for replay protection. Cleaned up every 5 minutes via cron.

**Indexes:** `by_jti(jti)`, `by_expiresAt(expiresAt)`

### `agent_rate_limits`
Sliding-window rate limit tracking per key (IP or agentId).

**Indexes:** `by_key(key)`

---

## 5. On-Chain Program Integration

ClawBank uses the **Squads Smart Account Program** (program ID: `SMRTzfY6DfH5ik3TKiyLFfXexV8uSG3d2UksSCYdunG`) for on-chain vault management.

### PDA Derivation

| PDA | Seeds | Purpose |
|-----|-------|---------|
| **ProgramConfig** | `["smart_account", "program_config"]` | Global config (treasury, account index counter) |
| **Settings** | `["smart_account", "settings", u128(accountIndex)]` | Per-vault configuration (signers, threshold, time lock) |
| **SmartAccount (Vault)** | `["smart_account", settingsPda, "smart_account", u8(0)]` | The actual vault holding funds |
| **SpendingLimit** | `["smart_account", settingsPda, "spending_limit", seed]` | Per-agent spending limit account |
| **Proposal** | `["smart_account", settingsPda, "proposal", u64(txIndex)]` | Transfer proposal for over-limit requests |

### Key Instructions Used

| Instruction | When Used | Signers |
|-------------|-----------|---------|
| `createSmartAccount` | Workspace creation | Creator (user wallet) + Sponsor (fee payer) |
| `addSignerAsAuthority` | Agent activation | Settings authority (user wallet) + Sponsor |
| `addSpendingLimitAsAuthority` | Agent activation / limit update | Settings authority + Sponsor |
| `removeSignerAsAuthority` | Agent revocation / member removal | Settings authority |
| `removeSpendingLimitAsAuthority` | Agent revocation / limit update | Settings authority + Sponsor |
| `useSpendingLimit` | Under-limit agent transfer | Agent (via Turnkey) + Sponsor |
| `createTransaction` | Over-limit proposal | Agent (via Turnkey) + Sponsor |
| `createProposal` | Over-limit proposal | Agent (via Turnkey) + Sponsor |
| `approveProposal` | Human approval | User wallet + Sponsor |
| `executeTransaction` | Human approval (execute) | User wallet + Sponsor |
| `rejectProposal` | Human denial | User wallet + Sponsor |

### Config Operations (Authority Pattern)

The Smart Account Program supports **single-instruction authority operations** for configuration changes. Instead of the v4 4-instruction flow (configTxCreate → proposalCreate → proposalApprove → configTxExecute), the `*AsAuthority` functions execute immediately when called by the `settingsAuthority`:

- `addSignerAsAuthority` — Add a new signer to the smart account
- `removeSignerAsAuthority` — Remove a signer
- `addSpendingLimitAsAuthority` — Create a spending limit
- `removeSpendingLimitAsAuthority` — Remove a spending limit

This simplifies all agent lifecycle and configuration operations to 1-2 instructions per transaction.

### Account Index Derivation

When creating a new smart account, the program uses `programConfig.smartAccountIndex + 1` as the seed for the new Settings PDA. After creation, it increments the stored index. Client-side code must account for this offset:

```typescript
const nextAccountIndex = BigInt(programConfig.smartAccountIndex.toString()) + 1n;
const [settingsPda] = smartAccount.getSettingsPda({ accountIndex: nextAccountIndex });
```

---

## 6. Transaction Building (Build-then-Sign)

All on-chain transactions follow the **build-then-sign** pattern:

```
1. Backend (Convex action):
   ├── Reads on-chain state (Settings account, ProgramConfig, etc.)
   ├── Builds TransactionInstruction(s) via @sqds/smart-account SDK
   ├── Compiles into VersionedTransaction with payerKey = sponsor
   ├── Partial-signs with sponsor keypair (fee payer only)
   └── Returns base64-serialized transaction

2. Frontend (React):
   ├── Receives serialized transaction
   ├── Deserializes into VersionedTransaction
   ├── Signs with user's Privy embedded wallet
   ├── Re-serializes to base64
   └── Calls submit action

3. Backend (submit action):
   ├── Deserializes fully-signed transaction
   ├── Sends to Solana RPC (sendTransaction)
   ├── Confirms on-chain (confirmTransaction)
   └── Only then writes to DB (atomicity invariant)
```

**Critical invariant:** DB writes ONLY happen after on-chain confirmation succeeds. If `sendTransaction` or `confirmTransaction` throws, no DB mutations are called.

### Transaction Builder Functions (`convex/lib/txBuilders.ts`)

Five pure functions that construct transactions without side effects:

| Function | Instructions | Purpose |
|----------|-------------|---------|
| `buildCreateWorkspaceTxCore` | `createSmartAccount` | Create a new smart account vault |
| `buildAgentActivationTxCore` | `addSignerAsAuthority` + `addSpendingLimitAsAuthority` | Add agent as signer with spending limit |
| `buildAgentRevocationTxCore` | `removeSignerAsAuthority` + `removeSpendingLimitAsAuthority` (if limit exists) | Remove agent signer and spending limit |
| `buildSpendingLimitUpdateTxCore` | `removeSpendingLimitAsAuthority` (if old) + `addSpendingLimitAsAuthority` | Replace spending limit |
| `buildRemoveMemberTxCore` | `removeSignerAsAuthority` | Remove human member from smart account |

All builders:
- Accept `sponsorPublicKey` for the fee payer
- Accept `userWallet` (or `creatorWallet`) as the settings authority / signer
- Return a `VersionedTransaction` with `payerKey = sponsorPublicKey`
- Never sign — signing happens in the action layer

---

## 7. Backend Actions

### Workspace Management

#### `createWorkspace.ts`
- **`buildCreateWorkspaceTx`** — Reads ProgramConfig for next account index, derives Settings PDA (index + 1), builds `createSmartAccount` instruction, partial-signs with sponsor. Returns `{ serializedTx, settingsAddress }`.
- **`submitCreateWorkspaceTx`** — Submits user-signed tx, confirms on-chain, derives vault PDA, stores workspace + members + invites in DB.

#### `removeMember.ts`
- **`buildRemoveMemberTx`** — Reads Settings account, verifies member exists on-chain, builds `removeSignerAsAuthority` instruction. Returns serialized tx.
- **`submitRemoveMemberTx`** — Submits tx, confirms, reconciles DB membership state from on-chain signers.

#### `fetchMembersOnchain.ts`
- **`fetchMembersOnchain`** — Reads Settings account, maps signers with permission checks (Initiate, Vote, Execute), reconciles DB.

### Agent Lifecycle

#### `provisionAgent.ts`
- **`provisionAgent`** — Creates Turnkey wallet via API, derives Solana keypair, stores public key on agent record. Runs asynchronously after agent creation.

#### `generateConnectCode.ts`
- **`generateConnectCode`** — Generates 6-character alphanumeric code, hashes it (SHA-256), stores in DB with 15-minute TTL. Returns plaintext code for display.

#### `buildAgentActivationTx.ts`
- **`buildAgentActivationTx`** — Reads Settings account, verifies agent isn't already a signer, generates spending limit seed (Keypair), builds activation instructions (addSigner + addSpendingLimit). Returns `{ serializedTx, createKey }`.
- **`submitAgentActivationTx`** — Submits tx, confirms, sets agent status to "active", stores on-chain spending limit key, logs activity.

#### `buildAgentRevocationTx.ts`
- **`buildAgentRevocationTx`** — Reads Settings account, checks if agent is on-chain signer. If not on-chain, returns empty tx (DB-only revocation). Otherwise builds revocation instructions.
- **`submitAgentRevocationTx`** — If empty tx: does DB-only revocation. Otherwise submits tx, confirms, revokes agent (sets status, clears connect code, deletes sessions), cancels pending transfer requests, logs activity.

### Agent Transfers

#### `agentTransfer.ts`
The core transfer action (called by SDK via HTTP endpoint). Handles two paths:

**Under-limit (auto-execute):**
1. Validates agent session (DPoP or Bearer)
2. Loads agent, workspace, spending limit
3. Calls `checkSpendingLimit()` — if allowed:
4. Derives spending limit PDA from `onchainCreateKey`
5. Builds `useSpendingLimit` instruction (vault → recipient)
6. Signs with Turnkey (agent wallet) + sponsor
7. Submits + confirms on-chain
8. Updates `spentAmount`, stores request as "executed"
9. Logs activity with SOL price and USD value

**Over-limit (proposal):**
1. Same validation + spending limit check → not allowed
2. Reads Settings account for `transactionIndex`
3. Builds SOL transfer message (system program transfer from vault)
4. Creates `createTransaction` + `createProposal` instructions
5. Signs with Turnkey (agent) + sponsor
6. Submits + confirms on-chain
7. Stores request as "pending_approval" with proposal address
8. Logs activity

#### `transferApproval.ts`
Human approval/denial of pending proposals:

- **`buildApproveTransferRequest`** — Builds `approveProposal` + `executeTransaction` instructions. Returns serialized tx.
- **`submitApproveTransferRequest`** — Submits tx, confirms, updates request status to "approved", logs activity.
- **`buildDenyTransferRequest`** — Builds `rejectProposal` instruction. Returns serialized tx.
- **`submitDenyTransferRequest`** — Submits tx, confirms, updates request status to "denied", logs activity.

### Spending Limits

#### `updateSpendingLimitOnchain.ts`
- **`buildSpendingLimitUpdateTx`** — Generates new seed, builds remove (if old exists) + add spending limit instructions. Returns `{ serializedTx, newCreateKey }`.
- **`submitSpendingLimitUpdateTx`** — Submits tx, confirms, updates DB spending limit record with new on-chain key, logs activity.

### Agent Auth

#### `agentAuth.ts`
- **`exchangeConnectCode`** — Validates connect code, provisions DPoP session (v2) or Bearer session (v1), returns tokens.
- **`agentStatus`** — Returns agent status + spending limits (used by SDK status endpoint).

#### `agentRefresh.ts`
- **`agentRefresh`** — Rotates access + refresh tokens. Validates DPoP proof, checks refresh token family sequence. If reuse detected (sequence mismatch), revokes ALL sessions for the agent (compromise response).

#### `httpAuth.ts`
- **`authenticate`** — Internal action for HTTP endpoint auth. Validates DPoP proof or Bearer token, returns agentId.

### Token Data

#### `fetchTokenBalances.ts`
Fetches SOL + SPL token balances for vault address from Solana RPC.

#### `fetchTokenMetadata.ts`
Fetches token symbol, name, icon, decimals from Jupiter API. Caches for 24 hours.

#### `fetchTokenPrices.ts`
Fetches token USD prices from Jupiter Price API v2. Caches for 60 seconds.

#### `getTokenMetadata.ts` / `getTokenPrices.ts` / `getWorkspaceBalance.ts`
Public wrappers that read cache and trigger fetches when stale.

---

## 8. Backend Queries & Mutations

### Queries

| File | Function | Description |
|------|----------|-------------|
| `listUserWorkspaces.ts` | `listUserWorkspaces` | All workspaces where user is creator or member |
| `agents.ts` | `list` | Agents in a workspace with status + spending limits |
| `agents.ts` | `getConnectCode` | Active connect code for an agent |
| `transferRequests.ts` | `list` | All transfer requests for workspace (with agent names, live spending limits) |
| `transferRequests.ts` | `listPending` | Only pending_approval requests |
| `transferRequests.ts` | `pendingCount` | Count of pending requests (for tab badge) |
| `activityLog.ts` | `list` | Paginated activity log with optional category filter |
| `getWorkspaceMembers.ts` | `getWorkspaceMembers` | Members + pending email invites |

### Mutations

| File | Function | Description |
|------|----------|-------------|
| `agents.ts` | `create` | Create agent record (triggers async provisioning) |
| `agents.ts` | `updateSpendingLimit` | Update DB spending limit (amount, token, period) |
| `agents.ts` | `pause` | Set agent status to "paused" |
| `agents.ts` | `revoke` | DB-only revocation (for agents not yet on-chain) |
| `agents.ts` | `deletePending` | Delete agent still in "provisioning" status |

---

## 9. Internal Helpers

Located in `convex/internals/`. These are internal Convex functions (not exposed to clients).

### `agentHelpers.ts`
Agent CRUD, session management, and activity logging:
- `getAgentById`, `updateAgentProvision`, `updateAgentStatus`, `updateAgentConnectCode`, `updateAgentAuthPublicKey`
- `insertAgentSession`, `deleteSession`, `deleteConnectCodeSessions`, `getSessionByHash`, `updateSessionLastUsed`
- `getSpendingLimitsByAgent`, `getTokenMetadata`, `updateSpendingLimitOnchainKey`
- `logActivity` — Creates activity log entry with workspace, agent, actor, category, action, and metadata
- `revokeAgentInternal` — Sets status to "revoked", clears connect code, deletes all sessions

### `transferHelpers.ts`
Transfer request state management:
- `createTransferRequest` — Insert new request with status + spending limit snapshot
- `updateTransferRequestStatus` — Update status, txSignature, proposalAddress, errorMessage
- `getTransferRequest` — Fetch by ID
- `cancelPendingRequestsByAgent` — Cancel all pending requests when agent is revoked
- `updateSpentAmount` — Increment spending limit's spentAmount after successful transfer

### `workspaceHelpers.ts`
Workspace and membership operations:
- `getUserByToken` — Look up user by Privy token identifier
- `getWorkspaceById` — Fetch workspace record
- `getLastCreationTime` — Rate limit check for workspace creation (30s cooldown)
- `storeWorkspace` — Create workspace, members, and invites
- `reconcileMembersFromOnchain` — Sync DB members with on-chain signers (add missing, remove stale)
- `requireWorkspaceMember` — Authorization check (user must be workspace member)

### `dpopHelpers.ts`
DPoP nonce replay protection:
- `checkAndStoreNonce` — Store DPoP `jti`, fail if already seen
- `cleanupExpiredNonces` — Delete expired nonces (runs every 5 min)
- `revokeAllAgentSessions` — Delete all sessions for an agent (compromise response)

### `cacheHelpers.ts`
Token metadata and price caching:
- `getCachedMetadata` / `upsertTokenMetadata` — 24-hour TTL
- `getCachedPrices` / `upsertTokenPrices` — 60-second TTL

### `rateLimitCheck.ts`
- `check` — Sliding-window rate limit enforcement using `agent_rate_limits` table

---

## 10. Library Modules

Located in `convex/lib/`. Pure functions and utilities.

### `txBuilders.ts`
Five transaction builder functions (see [Section 6](#6-transaction-building-build-then-sign)).

### `spendingLimitPolicy.ts`
Pure spending limit decision logic:

```typescript
checkSpendingLimit({
  spentAmount: number,
  limitAmount: number,
  requestAmount: number,
  periodStart: number,
  periodType: "daily" | "weekly" | "monthly",
  now: number,
}) → {
  allowed: boolean,
  effectiveSpent: number,
  remaining: number,
  periodExpired: boolean,
}
```

Period durations: daily = 86,400,000ms, weekly = 604,800,000ms, monthly = 2,592,000,000ms.

If the period has expired, `spentAmount` resets to 0. The function is the **single source of truth** for the auto-execute vs. proposal path.

Also exports: `lamportsToSol(lamports)`, `solToLamports(sol)`.

### `turnkeyHelpers.ts`
Turnkey API integration for agent wallet signing:
- `signWithTurnkey(tx, walletAddress)` — Calls Turnkey `/signRawPayload` API, places Ed25519 signature in the correct signer slot of the VersionedTransaction
- `extractErrorMessage(err, fallback)` — Safe error message extraction from unknown error types
- `NATIVE_SOL_MINT` — `"So11111111111111111111111111111111111111112"`

### `authMiddleware.ts`
Validates Privy JWT for authenticated requests. Extracts user identity from Convex auth context.

### `connectCode.ts`
Connect code generation and validation:
- `makeConnectCode()` — 6-character alphanumeric (A-Z, 0-9)
- `sha256Hex(input)` — SHA-256 hash for secure storage
- `CONNECT_CODE_TTL_MS` — 15-minute expiry

### `dpop.ts`
DPoP proof verification:
- `verifyDPoPProof({ proof, method, url, accessTokenHash })` — Verifies Ed25519-signed JWT, checks `htm`, `htu`, `iat`, `jti`, `ath` claims
- `base64urlDecode` / `base64urlEncode` — Encoding utilities

### `rateLimit.ts`
Sliding-window rate limiter:
- `checkRateLimit(ctx, { key, windowMs, maxRequests })` — Returns `{ allowed, remaining }`. Uses `agent_rate_limits` table for persistence.

---

## 11. HTTP API (SDK Endpoints)

Base URL: `https://resilient-perch-336.convex.site`

All endpoints are `POST` with JSON bodies. Defined in `convex/http.ts`.

### `POST /agent/connect`
Exchange a one-time connect code for session tokens. **Unauthenticated.** Rate limited: 10/min per IP.

**Request:**
```json
{
  "connectCode": "I6T982",
  "authPublicKey": "base64url-ed25519-public-key"
}
```

**Response (v2):**
```json
{
  "accessToken": "hex-64",
  "refreshToken": "hex-64",
  "agentId": "convex-id",
  "workspaceId": "convex-id",
  "publicKey": "base58-solana-address",
  "expiresIn": 300,
  "serverSalt": "hex-64"
}
```

### `POST /agent/refresh`
Rotate tokens. **DPoP required.**

**Headers:** `Authorization: DPoP <access-token>`, `X-DPoP: <proof-jwt>`

**Request:** `{ "refreshToken": "hex-64" }`

**Response:** `{ "accessToken": "new", "refreshToken": "new", "expiresIn": 300 }`

**403** = refresh token reuse detected → all sessions revoked.

### `POST /agent/transfer`
Execute transfer or create proposal. **DPoP required.**

**Request:**
```json
{
  "recipient": "base58-address",
  "amountSol": 0.001,
  "shortNote": "Payment reason",
  "description": "Optional longer explanation"
}
```

**Response (executed):** `{ "requestId": "...", "status": "executed", "txSignature": "..." }`

**Response (proposal):** `{ "requestId": "...", "status": "pending_approval", "proposalAddress": "..." }`

### `POST /agent/status`
Get agent info + spending limits. **DPoP required.**

**Request:** `{}`

**Response:**
```json
{
  "agentId": "...",
  "workspaceId": "...",
  "status": "active",
  "limits": [{
    "tokenMint": "So11111111111111111111111111111111111111112",
    "limitAmount": 0.0001,
    "spentAmount": 0.00001,
    "periodType": "daily",
    "periodStart": 1772110974776
  }]
}
```

---

## 12. Agent Authentication (DPoP v2)

Agents authenticate using **Demonstrating Proof of Possession (DPoP)**, an Ed25519-based scheme that prevents token replay attacks.

### Flow

```
1. Agent generates Ed25519 keypair locally
2. Agent calls /agent/connect with connectCode + authPublicKey
3. Server stores authPublicKey, returns accessToken + refreshToken
4. For each request, agent creates a DPoP proof JWT:
   - Header: { "typ": "dpop+jwt", "alg": "EdDSA", "jwk": { ... } }
   - Payload: { "htm": "POST", "htu": "/agent/transfer", "iat": now, "jti": uuid, "ath": sha256(accessToken) }
   - Signed with Ed25519 private key
5. Request includes:
   - Authorization: DPoP <accessToken>
   - X-DPoP: <proof-jwt>
6. Server verifies: signature, jwk matches stored authPublicKey, jti is unique (nonce), ath matches token hash
```

### Token Rotation

- Access tokens expire in 300 seconds
- SDK auto-refreshes via `/agent/refresh` when expiring within 60s
- Refresh uses DPoP + refreshToken → new accessToken + refreshToken
- **Refresh token reuse detection:** Each refresh increments a `refreshSequence` counter within a `refreshTokenFamily`. If a sequence mismatch is detected (token reuse), ALL sessions for the agent are revoked immediately.

### Session Storage

Tokens are stored as SHA-256 hashes in `agent_sessions`. The server never stores plaintext tokens. Sessions are linked to agents via `agentId` index.

---

## 13. Agent SDK (`@clawbank/sdk`)

The SDK is a Node.js TypeScript library for AI agents to interact with ClawBank.

### Installation & Usage

```typescript
import { ClawBank } from "@clawbank/sdk";

// First time: connect with a code from the web app
const client = await ClawBank.connect("I6T982", {
  apiUrl: "https://resilient-perch-336.convex.site",
  keystorePath: ".clawbank",
});

// Subsequent runs: load from encrypted keystore
const client = await ClawBank.load({ keystorePath: ".clawbank" });

// Check status
const status = await client.status();
// { agentId, workspaceId, status: "active", limits: [...] }

// Transfer SOL
const result = await client.transfer({
  recipient: "4MnEbZD5fvvGMHgVN77vZCYixR7zrwQZiydXLDHnMnVB",
  amount: 0.00001,
  note: "API payment",
  description: "Monthly vendor subscription",
});
// { requestId, status: "executed", txSignature } — or —
// { requestId, status: "pending_approval", proposalAddress }
```

### Architecture

```
src/
├── index.ts          — Public exports: ClawBank, errors, types
├── client.ts         — ClawBank class (connect, load, transfer, status)
├── types.ts          — TransferParams, TransferResult, StatusResult, etc.
├── errors.ts         — ClawBankApiError, AuthenticationError
├── api/
│   ├── transport.ts  — AuthenticatedTransport (DPoP headers, auto-retry on 401)
│   └── endpoints.ts  — Endpoint path definitions
└── auth/
    ├── tokens.ts     — TokenManager (access/refresh rotation, auto-refresh)
    ├── dpop.ts       — DPoP proof JWT creation (Ed25519)
    ├── keystore.ts   — Encrypted keystore (AES-256-GCM, scrypt KDF)
    └── crypto.ts     — Ed25519 keypair generation
```

### Keystore Encryption

Agent credentials (Ed25519 keypair + tokens + server metadata) are stored in an encrypted file (`.clawbank/keystore.json`):
- Encryption: AES-256-GCM
- Key derivation: scrypt (from `CLAWBANK_KEYSTORE_KEY` env var)
- Contains: privateKey, publicKey, accessToken, refreshToken, agentId, workspaceId, apiUrl, serverSalt

### CLI Scripts

```bash
# Connect agent
CLAWBANK_KEYSTORE_KEY=secret node connect.mjs <CODE>

# Transfer SOL
CLAWBANK_KEYSTORE_KEY=secret node transfer.mjs <RECIPIENT> <AMOUNT> <NOTE> [DESCRIPTION]
```

---

## 14. Frontend

### Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | LandingPage | Login screen. Redirects to `/workspaces` if authenticated. |
| `/workspaces` | WorkspacesPage | Main dashboard with workspace list, drawer navigation |

### Key Components

**Workspace Management:**
- `CreateWorkspaceModal` — Multi-step: name → add members (email/wallet) → build tx → sign → submit
- `WorkspaceDrawer` — Side panel with tabs: Requests, Agents, Humans, Activity
- `WorkspaceCard` — Clickable card showing workspace name, vault address, creation date
- `BalanceHeader` — Animated USD balance display with stacked token icons
- `DeleteMemberModal` — Confirm + execute on-chain member removal

**Agent Management:**
- `AddAgentModal` — Create agent with name + spending budget (token, amount, period)
- `AgentsTab` — List agents with status badges, activate/revoke/regenerate connect code actions
- `EditBudgetModal` — Update spending limit (on-chain transaction)

**Transfer Requests:**
- `RequestsTab` — List pending/historical transfer requests with approve/deny buttons
- `RequestDetailModal` — Full transfer details: amount, recipient, note, proposal link, status history

**Activity Log:**
- `ActivityTab` — Paginated timeline with category filtering (transactions, config, agent lifecycle)
- `ActivityDetailModal` — Full activity entry with metadata, tx signature link

**Shared UI:**
- `Modal`, `StatusBadge`, `EmptyState`, `Skeleton`, `ListSkeleton`, `TokenIcon`, `PeriodSelector`, `TokenDropdown`

### Hooks

| Hook | Purpose |
|------|---------|
| `useAuth()` | Privy auth state (login, logout, isAuthenticated, email, walletAddress, exportWallet) |
| `useSignTransaction()` | Build-then-sign flow: manages status ("building" → "signing" → "submitting"), signs with Privy wallet |
| `useWorkspaceBalance(id)` | Fetch vault token balances + USD totals |
| `useWorkspaceMembers(id)` | Fetch members + pending invites |
| `useTokenMetadata(mints)` | Token symbol/decimals/icon from cache |
| `useTokenPrices(mints)` | Token USD prices from cache |

### Providers

- `ConvexProvider` — Wraps app with Convex client + auth integration
- `PrivyProvider` — Wraps app with Privy auth + embedded Solana wallet config

---

## 15. Core Flows

### Flow 1: Create Workspace

```
Human (UI)                    Convex                         Solana
    │                            │                              │
    ├── Enter name + members ──► │                              │
    │                            ├── Read ProgramConfig ──────► │
    │                            │◄── smartAccountIndex ────────┤
    │                            ├── Derive settingsPda         │
    │                            │   (index + 1)                │
    │                            ├── Build createSmartAccount   │
    │                            │   instruction                │
    │                            ├── Sponsor partial-sign       │
    │◄── serializedTx ──────────┤                              │
    ├── Sign with Privy wallet   │                              │
    ├── Submit signed tx ──────► │                              │
    │                            ├── sendTransaction ─────────► │
    │                            ├── confirmTransaction ──────► │
    │                            ├── Store workspace in DB      │
    │◄── workspaceId ───────────┤                              │
```

### Flow 2: Connect Agent

```
Human (UI)                    Convex                     Agent (SDK)
    │                            │                            │
    ├── Click "Connect Agent" ─► │                            │
    │                            ├── Generate 6-char code     │
    │◄── Display code ──────────┤                            │
    │                            │                            │
    │   (Human shares code)      │                            │
    │                            │◄── POST /agent/connect ────┤
    │                            │    (code + authPublicKey)   │
    │                            ├── Validate code             │
    │                            ├── Create DPoP session       │
    │                            ├── accessToken + refreshToken│
    │                            │──────────────────────────► │
    │                            │                            ├── Save to keystore
```

### Flow 3: Activate Agent

```
Human (UI)                    Convex                         Solana
    │                            │                              │
    ├── Click "Activate" ──────► │                              │
    │                            ├── Read Settings account ───► │
    │                            │   (verify not already signer)│
    │                            ├── Generate spending limit    │
    │                            │   seed (Keypair)             │
    │                            ├── Build addSignerAsAuthority │
    │                            │ + addSpendingLimitAsAuthority│
    │                            ├── Sponsor partial-sign       │
    │◄── serializedTx ──────────┤                              │
    ├── Sign with Privy wallet   │                              │
    ├── Submit signed tx ──────► │                              │
    │                            ├── Send + confirm on-chain ─► │
    │                            ├── Set agent status "active"  │
    │                            ├── Store onchainCreateKey     │
    │                            ├── Log activity               │
    │◄── success ───────────────┤                              │
```

### Flow 4: Under-Limit Transfer

```
Agent (SDK)                   Convex                         Solana
    │                            │                              │
    ├── POST /agent/transfer ──► │                              │
    │   (DPoP auth)              ├── Validate DPoP              │
    │                            ├── Load agent + workspace     │
    │                            ├── checkSpendingLimit → OK    │
    │                            ├── Build useSpendingLimit ix  │
    │                            ├── Sign with Turnkey (agent)  │
    │                            ├── Sponsor sign               │
    │                            ├── Send + confirm on-chain ─► │
    │                            │   (vault → recipient)        │
    │                            ├── Update spentAmount         │
    │                            ├── Store request "executed"   │
    │                            ├── Log activity               │
    │◄── { status: "executed",  ─┤                              │
    │      txSignature }         │                              │
```

### Flow 5: Over-Limit Transfer + Approval

```
Agent (SDK)                   Convex                         Solana
    │                            │                              │
    ├── POST /agent/transfer ──► │                              │
    │                            ├── checkSpendingLimit → DENY  │
    │                            ├── Build createTransaction    │
    │                            │ + createProposal             │
    │                            ├── Sign with Turnkey + sponsor│
    │                            ├── Send + confirm on-chain ─► │
    │                            ├── Store "pending_approval"   │
    │◄── { status: "pending_approval", proposalAddress } ──────┤
    │                            │                              │
Human (UI)                       │                              │
    │◄── See pending request ────┤                              │
    ├── Click "Approve" ────────►│                              │
    │                            ├── Build approveProposal      │
    │                            │ + executeTransaction          │
    │◄── serializedTx ──────────┤                              │
    ├── Sign with Privy ─────── ►│                              │
    │                            ├── Send + confirm on-chain ─► │
    │                            ├── Status → "approved"        │
    │                            ├── Log activity               │
    │◄── success ───────────────┤                              │
```

---

## 16. Security Model

### Principle: Sponsor is Fee-Payer Only

The sponsor wallet (`SPONSOR_PRIVATE_KEY`) is used **exclusively** as a Solana transaction fee payer. It is never added as a smart account signer. Only human wallets (Privy) and agent wallets (Turnkey) are signers. A compromised sponsor key cannot approve, execute, or modify the smart account.

### Principle: DB Writes After On-Chain Confirmation

All actions that modify both on-chain and DB state follow strict ordering:
1. Build transaction
2. Sign transaction
3. Send to Solana
4. **Confirm on-chain** (wait for block finality)
5. **Only then** write to Convex DB

If steps 3 or 4 fail, no DB mutations occur. This prevents DB/chain state divergence.

### Agent Security

- **Spending limits enforced on-chain** — The Squads Smart Account Program enforces limits atomically. Even if the backend is compromised, the on-chain program will reject over-limit `useSpendingLimit` calls.
- **DPoP prevents token replay** — Each request includes a unique `jti` nonce. Server stores seen nonces and rejects duplicates.
- **Refresh token family tracking** — If a refresh token is reused (indicating compromise), ALL sessions for that agent are immediately revoked.
- **Agent wallets are Turnkey-managed** — Private keys never leave Turnkey's secure enclaves. Signing is done via API calls.

### Human Security

- **Privy embedded wallet** — User's Solana keypair is managed by Privy with export capability. User signs all configuration transactions.
- **Threshold-based approval** — Smart account threshold (currently 1) determines how many signers must approve proposals. Future multi-sig support with threshold > 1.
- **Activity audit trail** — All actions (transfers, config changes, agent lifecycle) are logged with actor, timestamp, tx signature, and metadata.

### Rate Limiting

- `/agent/connect`: 10 attempts/min per IP
- Transfer requests: rate limited per agentId
- Workspace creation: 30-second cooldown per user

---

## 17. Testing

### Unit Tests (Vitest)

Located in `convex/lib/__tests__/`:

| File | Tests | Description |
|------|-------|-------------|
| `txBuilders.test.ts` | 20 tests | Verifies all 5 transaction builders: correct instruction parameters, sponsor never appears as authority/signer, correct instruction counts |
| `submitAtomicity.test.ts` | 15 tests | Verifies DB writes only happen after on-chain confirmation. If sendTransaction or confirmTransaction fails, no DB mutations are called |
| `spendingLimitPolicy.test.ts` | Tests | Pure function tests for spending limit decisions, period reset, edge cases |

Also: `src/utils/format.test.ts` — Formatting utility tests.

### End-to-End Tests (Playwright)

Located in `e2e/`:

| File | Description |
|------|-------------|
| `landing.spec.ts` | Landing page loads, "Get started" button, navigation |
| `activity-tab.spec.ts` | Activity log filtering, transaction details |
| `requests-tab.spec.ts` | Transfer request list, approval/denial flow |
| `requests-approval-demo.spec.ts` | Full demo: agent transfer → human approval → execution |

**Configuration:**
- Auth state saved in `e2e/.auth/` (Privy login persists across tests)
- Screenshots: ON (captured for every test)
- Videos: ON
- Traces: ON
- Results: `e2e/test-results/`, report: `e2e/playwright-report/`

### Running Tests

```bash
# Unit tests
npm test

# E2E tests (requires `npx convex dev` running)
npx playwright test

# All checks
bash scripts/checks.sh  # lint + typecheck + build + test
```

---

## 18. Environment & Configuration

### Convex Environment Variables

| Variable | Description |
|----------|-------------|
| `SOLANA_RPC_URL` | Solana mainnet-beta RPC endpoint |
| `SPONSOR_PRIVATE_KEY` | Base64-encoded Ed25519 keypair (fee payer) |
| `TURNKEY_API_PUBLIC_KEY` | Turnkey API authentication |
| `TURNKEY_API_PRIVATE_KEY` | Turnkey API authentication |
| `TURNKEY_ORGANIZATION_ID` | Turnkey organization ID |
| `JUPITER_API_KEY` | Jupiter API key for token data |

### Frontend Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_PRIVY_APP_ID` | Privy application identifier |
| `VITE_CONVEX_URL` | Convex deployment URL |

### SDK Environment Variables

| Variable | Description |
|----------|-------------|
| `CLAWBANK_KEYSTORE_KEY` | Encryption key for agent keystore (AES-256-GCM + scrypt) |
| `CLAWBANK_API_URL` | Override API base URL (default: production) |
| `CLAWBANK_KEYSTORE_PATH` | Override keystore directory (default: `.clawbank`) |

### Cron Jobs

| Schedule | Action | Description |
|----------|--------|-------------|
| Every 5 minutes | `cleanupExpiredNonces` | Deletes expired DPoP replay protection nonces |

---

## 19. Key Architectural Decisions

### D1: Squads Smart Account Program (not v4 Multisig)

ClawBank uses the Squads Smart Account Program (`SMRTzfY6DfH5ik3TKiyLFfXexV8uSG3d2UksSCYdunG`) instead of v4 Multisig. Benefits:
- **Single-instruction config changes** via `*AsAuthority` pattern (vs. 4-instruction propose/approve/execute flow)
- **Future arbitrary transaction support** — agents can execute swaps/DeFi within spending limits
- **Policy framework** — program whitelists, spending limits enforced atomically on-chain

SDK: `@sqds/smart-account` (installed from GitHub, not npm).

### D2: Sponsor is Fee-Payer Only

The sponsor wallet pays all Solana transaction fees but is never a smart account signer. Only humans (Privy wallets) and agents (Turnkey wallets) are signers. This prevents a compromised sponsor from controlling the vault.

### D3: Build-then-Sign Pattern

Transactions are constructed server-side (where secrets like sponsor key and RPC URLs live) but signed client-side (where user wallets live). This separation ensures:
- User always sees and approves what they're signing
- Sponsor key never leaves the server
- Frontend doesn't need direct RPC access for building

### D4: DPoP v2 Agent Authentication

Agents use Ed25519 DPoP proofs instead of simple Bearer tokens. Benefits:
- Tokens are bound to the agent's keypair — stolen tokens are useless without the private key
- Nonce-based replay protection
- Refresh token family tracking detects compromise and revokes all sessions

### D5: On-Chain Spending Limits

Spending limits are enforced both in the backend (policy check) AND on-chain (Squads program). Even if the backend is compromised, the on-chain program rejects transfers exceeding the limit. The backend check is an optimization to avoid failed transactions.

### D6: Activity Audit Trail

Every significant action is logged to the `activity_log` table with:
- Actor identity (human email or agent name)
- Action category and type
- On-chain transaction signature (when applicable)
- Amount and USD value (when applicable)
- Arbitrary metadata for context

This provides a complete audit trail for compliance and debugging.
