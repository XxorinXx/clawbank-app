# ClawBank Documentation

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Database Schema](#4-database-schema)
5. [Agent Lifecycle](#5-agent-lifecycle)
6. [Authentication](#6-authentication)
7. [HTTP API Reference](#7-http-api-reference)
8. [Transfer System](#8-transfer-system)
9. [Spending Limit Policy](#9-spending-limit-policy)
10. [On-Chain Integration](#10-on-chain-integration)
11. [SDK Reference (@clawbank/sdk)](#11-sdk-reference-clawbanksdk)
12. [Frontend Application](#12-frontend-application)
13. [Cron Jobs](#13-cron-jobs)
14. [Rate Limiting](#14-rate-limiting)
15. [Environment Variables](#15-environment-variables)
16. [Security Model](#16-security-model)

---

## 1. Overview

ClawBank is an AI-agent banking layer on Solana. It lets human teams create shared multisig vaults (via Squads v4), then connect AI agents to those vaults with bounded, cryptographically-enforced spending limits. Agents can spend autonomously within their budget; over-limit transfers require human approval via multisig proposal.

**Mental model**: ClawBank = bank account for humans + AI agents. Squads = vault + governance. Turnkey = secure agent signer. Privy = human identity + wallet. Convex = coordination brain.

### How It Works

1. A human creates a **workspace**, which provisions a Squads v4 multisig vault on Solana.
2. The human creates an **agent** within the workspace, setting a name and spending limit.
3. The agent is **provisioned** with a Turnkey-custodied Ed25519 wallet (the agent never holds its own private key).
4. A 6-character **connect code** is generated. The agent SDK exchanges this code for DPoP-authenticated session tokens.
5. Once connected, the human **activates** the agent on-chain, adding it to the multisig with `Initiate`-only permission and creating a Squads spending limit.
6. The agent can now call `transfer()` through the SDK. Transfers within the spending limit execute immediately on-chain. Transfers exceeding the limit create a multisig proposal requiring human approval.

---

## 2. Architecture

### Directory Structure

```
clawbank-app/
  convex/                 # Backend (Convex serverless functions)
    _generated/           # Auto-generated Convex types and API bindings
    actions/              # Side-effectful actions (external API calls, signing)
    internals/            # Internal queries/mutations (not callable from clients)
    lib/                  # Pure utility libraries (DPoP, rate limiting, tx builders)
    mutations/            # Public mutations (client-callable state changes)
    queries/              # Public queries (client-callable reads)
    auth.config.ts        # Privy JWT auth configuration
    crons.ts              # Scheduled jobs
    env.ts                # Server-side environment variable accessors
    http.ts               # HTTP router (agent API endpoints)
    schema.ts             # Database schema definition
    users.ts              # User upsert mutation
  src/                    # Frontend (React + Vite + TypeScript)
    components/           # UI components
      ui/                 # Primitive UI elements (badges, dropdowns, skeletons)
    hooks/                # Custom React hooks
    providers/            # React context providers (Convex, Privy)
    routes/               # TanStack Router file-based routes
    types/                # TypeScript type definitions
    utils/                # Pure utility functions (format, animations, cn)
  docs/                   # Architecture and planning documents
  scripts/                # CLI helper scripts

clawbank-sdk/             # Agent SDK (separate repository)
  src/
    api/                  # Endpoints definition, authenticated transport
    auth/                 # Keypair, keystore, tokens, DPoP proof
    client.ts             # Main ClawBank class
    errors.ts             # Error classes
    types.ts              # TypeScript interfaces
    index.ts              # Public exports
  tests/                  # Unit tests (vitest)
  test-e2e.mjs            # End-to-end integration test
  test-authed.mjs         # Authenticated endpoint test
```

### Request Flow

```
Agent SDK                    Convex HTTP Router              Convex Backend              Solana
   |                              |                              |                        |
   |--- POST /agent/connect ---->|                              |                        |
   |    (connectCode + pubKey)   |--- exchangeConnectCode ----->|                        |
   |                              |    (validate, issue tokens) |                        |
   |<--- tokens + serverSalt ----|<-----------------------------|                        |
   |                              |                              |                        |
   |--- POST /agent/transfer -->|                              |                        |
   |    (DPoP + Authorization)   |--- authenticateRequest ----->|                        |
   |                              |--- agentTransfer ---------->|--- sendTransaction --->|
   |<--- { status, txSig } -----|<-----------------------------|<--- confirmation ------|
```

---

## 3. Tech Stack

### Backend

| Technology | Purpose |
|---|---|
| Convex v1.31 | Database, serverless functions, realtime subscriptions |
| Turnkey SDK | Agent wallet custody and transaction signing |
| Squads Multisig SDK (`@sqds/multisig`) | On-chain vault governance, spending limits |
| `@solana/web3.js` | Solana RPC, transaction building |
| `@solana/spl-token` | SPL token operations |
| Node.js `crypto` | SHA-256 hashing, token generation, Ed25519 verification |

### Frontend

| Technology | Purpose |
|---|---|
| React 18 | UI framework |
| Vite 6 | Build tool and dev server |
| TypeScript 5.6 | Type safety |
| TanStack Router v1 | File-based routing |
| TanStack Query v5 | Server state management (on-chain data caching) |
| Privy (`@privy-io/react-auth`) | Human authentication + embedded Solana wallets |
| Tailwind CSS v4 | Styling |
| Motion (Framer Motion) | Animations |
| Sonner | Toast notifications |
| Lucide | Icons |

### SDK

| Technology | Purpose |
|---|---|
| Node.js `crypto` | Ed25519 keypair, AES-256-GCM encryption, SHA-256, DPoP signing |
| Node.js `fs` | Keystore file I/O |
| Zero runtime dependencies | Only dev dependencies (TypeScript, Vitest) |

### External Services

| Service | Purpose |
|---|---|
| Privy | Human auth (Google, email), embedded Solana wallets |
| Turnkey | Agent wallet custody, Ed25519 signing |
| Helius | Solana RPC endpoint |
| Jupiter API | Token metadata and pricing |
| Squads v4 | On-chain multisig protocol |

---

## 4. Database Schema

All tables are defined in `convex/schema.ts` using Convex's `defineSchema` / `defineTable`.

### `users`

Stores human user accounts, linked to Privy identity.

| Field | Type | Description |
|---|---|---|
| `email` | `string` | User email address |
| `walletAddress` | `string` | Privy embedded Solana wallet address |
| `createdAt` | `number` | Unix millisecond timestamp |
| `tokenIdentifier` | `string` | Privy JWT token identifier (unique per user) |

**Indexes**: `by_token` on `["tokenIdentifier"]`

### `workspaces`

Each workspace maps 1:1 to a Squads v4 multisig vault on Solana.

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Human-readable workspace name |
| `multisigAddress` | `string` | Squads multisig PDA (base58) |
| `vaultAddress` | `string` | Squads vault PDA index 0 (base58) |
| `creatorTokenIdentifier` | `string` | Token identifier of the creating user |
| `createdAt` | `number` | Unix millisecond timestamp |

**Indexes**: `by_creator` on `["creatorTokenIdentifier"]`, `by_multisig` on `["multisigAddress"]`

### `workspace_members`

Tracks human membership in workspaces. On-chain members are reconciled with this table.

| Field | Type | Description |
|---|---|---|
| `workspaceId` | `id("workspaces")` | FK to workspace |
| `walletAddress` | `string` | Member's Solana wallet address |
| `role` | `"creator" \| "member"` | Member role |
| `addedAt` | `number` | Unix millisecond timestamp |

**Indexes**: `by_workspace` on `["workspaceId"]`, `by_wallet` on `["walletAddress"]`

### `workspace_invites`

Pending email invitations to join a workspace.

| Field | Type | Description |
|---|---|---|
| `workspaceId` | `id("workspaces")` | FK to workspace |
| `email` | `string` | Invitee email address |
| `status` | `"pending" \| "accepted" \| "rejected"` | Invite status |
| `invitedAt` | `number` | Unix millisecond timestamp |

**Indexes**: `by_workspace` on `["workspaceId"]`, `by_email` on `["email"]`

### `agents`

AI agents connected to a workspace. Each agent has a Turnkey-custodied wallet.

| Field | Type | Description |
|---|---|---|
| `workspaceId` | `id("workspaces")` | FK to workspace |
| `name` | `string` | Agent name (1-32 chars, unique per workspace) |
| `turnkeyWalletId` | `string?` | Turnkey wallet ID (set after provisioning) |
| `publicKey` | `string?` | Agent's Solana public key (base58) |
| `status` | `"provisioning" \| "connected" \| "active" \| "paused" \| "revoked"` | Agent lifecycle state |
| `connectCode` | `string?` | Raw 6-char connect code (displayed in UI, cleared on use) |
| `connectCodeExpiresAt` | `number?` | Connect code expiry (Unix ms) |
| `authPublicKey` | `string?` | Base64url Ed25519 public key for DPoP verification (v2 auth) |
| `createdAt` | `number` | Unix millisecond timestamp |

**Indexes**: `by_workspace` on `["workspaceId"]`, `by_publicKey` on `["publicKey"]`

### `agent_sessions`

Session tokens for agent authentication. Supports both v1 (bearer) and v2 (DPoP) auth.

| Field | Type | Description |
|---|---|---|
| `agentId` | `id("agents")` | FK to agent |
| `tokenHash` | `string` | SHA-256 hex of the raw token (raw token is NEVER stored) |
| `expiresAt` | `number` | Expiry (Unix ms) |
| `lastUsedAt` | `number` | Last access (Unix ms) |
| `sessionType` | `"connect_code" \| "session" \| "access" \| "refresh"` | Token purpose |
| `authVersion` | `"v1" \| "v2"?` | Auth protocol version (optional, v2 for DPoP) |
| `refreshTokenFamily` | `string?` | UUID linking access/refresh pair for theft detection |
| `refreshSequence` | `number?` | Monotonic counter incremented on each refresh rotation |

**Indexes**: `by_tokenHash` on `["tokenHash"]`, `by_agentId` on `["agentId"]`, `by_refreshFamily` on `["refreshTokenFamily"]`

**Session types explained**:
- `connect_code` — Single-use code exchanged during agent registration. 10-minute TTL.
- `session` — v1 bearer token. 24-hour TTL.
- `access` — v2 DPoP-bound access token. 5-minute TTL.
- `refresh` — v2 refresh token. 30-day TTL. Used to rotate access tokens.

### `spending_limits`

Per-agent spending limits, enforced both in the backend and on-chain via Squads.

| Field | Type | Description |
|---|---|---|
| `workspaceId` | `id("workspaces")` | FK to workspace |
| `agentId` | `id("agents")` | FK to agent |
| `tokenMint` | `string` | Token mint address (e.g., `So11111111111111111111111111111111111111112` for SOL) |
| `limitAmount` | `number` | Maximum spend per period (in SOL or token units) |
| `spentAmount` | `number` | Cumulative spend this period (in SOL or token units) |
| `periodType` | `"daily" \| "weekly" \| "monthly"` | Reset period |
| `periodStart` | `number` | Current period start (Unix ms) |
| `onchainCreateKey` | `string?` | Public key used as Squads spending limit `createKey` PDA seed |

**Indexes**: `by_agent_token` on `["agentId", "tokenMint"]`, `by_workspace` on `["workspaceId"]`

### `transfer_requests`

Records every transfer attempt by an agent, whether executed immediately or routed to multisig approval.

| Field | Type | Description |
|---|---|---|
| `agentId` | `id("agents")` | Initiating agent |
| `workspaceId` | `id("workspaces")` | FK to workspace |
| `recipient` | `string` | Destination Solana address |
| `amountLamports` | `number` | Transfer amount in lamports |
| `shortNote` | `string` | 1-80 character human summary |
| `description` | `string` | Full description |
| `status` | `string` | Request lifecycle status (see below) |
| `spendingLimitSnapshot` | `object` | Point-in-time limit state at request time |
| `txSignature` | `string?` | On-chain transaction signature |
| `proposalAddress` | `string?` | Squads proposal PDA (for over-limit requests) |
| `proposalIndex` | `number?` | Squads transaction index |
| `errorMessage` | `string?` | Error details on failure |
| `createdAt` | `number` | Unix ms |
| `updatedAt` | `number` | Unix ms |

**Status values**: `"pending_execution"`, `"executed"`, `"pending_approval"`, `"approved"`, `"denied"`, `"failed"`

**Indexes**: `by_workspace` on `["workspaceId"]`, `by_agent` on `["agentId"]`, `by_txSignature` on `["txSignature"]`

### `activity_log`

Audit trail for all significant events within a workspace.

| Field | Type | Description |
|---|---|---|
| `workspaceId` | `id("workspaces")` | FK to workspace |
| `agentId` | `id("agents")` | FK to agent |
| `action` | `string` | Action type identifier |
| `txSignature` | `string?` | Associated on-chain transaction |
| `amount` | `number?` | Optional amount |
| `tokenMint` | `string?` | Optional token mint |
| `metadata` | `any?` | Arbitrary JSON metadata |
| `timestamp` | `number` | Unix ms |

**Indexes**: `by_workspace`, `by_agent`, `by_txSignature`

**Known action types**:
- `session_created` — Agent session established
- `agent_created` — Agent provisioned with Turnkey wallet
- `provision_failed` — Turnkey provisioning error
- `transfer_executed` — Under-limit transfer completed on-chain
- `transfer_failed` — Transfer failed
- `transfer_proposal_created` — Over-limit transfer routed to multisig
- `transfer_proposal_failed` — Proposal creation failed
- `transfer_approved` — Human approved multisig proposal
- `transfer_denied` — Human denied multisig proposal
- `agent_activated_onchain` — Agent added to multisig + spending limit created
- `agent_revoked` — Agent revoked (DB-level)
- `agent_revoked_onchain` — Agent removed from multisig on-chain
- `limit_updated` — Spending limit changed (DB-level)
- `limit_updated_onchain` — Spending limit updated on-chain

### `token_metadata_cache`

Cached token metadata from Jupiter API.

| Field | Type | Description |
|---|---|---|
| `mint` | `string` | Token mint address |
| `symbol` | `string` | Token symbol (e.g., "SOL") |
| `name` | `string` | Full token name |
| `icon` | `string?` | Optional icon URL |
| `decimals` | `number` | Decimal places |
| `updatedAt` | `number` | Last cache refresh (Unix ms) |

**Indexes**: `by_mint` on `["mint"]`

### `token_price_cache`

Cached token USD prices from Jupiter API.

| Field | Type | Description |
|---|---|---|
| `mint` | `string` | Token mint address |
| `priceUsd` | `number` | USD price |
| `updatedAt` | `number` | Last cache refresh (Unix ms) |

**Indexes**: `by_mint` on `["mint"]`

### `dpop_nonces`

Replay protection for DPoP proofs. Each `jti` (JWT ID) is stored to prevent reuse.

| Field | Type | Description |
|---|---|---|
| `jti` | `string` | JWT ID from the DPoP proof (unique per request) |
| `agentId` | `id("agents")` | FK to agent |
| `expiresAt` | `number` | Expiry (Unix ms, 60 seconds from creation) |

**Indexes**: `by_jti` on `["jti"]`, `by_expiresAt` on `["expiresAt"]`

### `agent_rate_limits`

Sliding window rate limiting for sensitive endpoints.

| Field | Type | Description |
|---|---|---|
| `key` | `string` | Rate limit key (e.g., `"connect:<ip-address>"`) |
| `windowStart` | `number` | Window start (Unix ms) |
| `count` | `number` | Request count within the current window |

**Indexes**: `by_key` on `["key"]`

---

## 5. Agent Lifecycle

### State Machine

```
provisioning  -->  connected  -->  active  -->  revoked
                                          -->  paused
```

| State | Description |
|---|---|
| `provisioning` | Agent record created. Turnkey wallet being provisioned. Connect code generated. |
| `connected` | SDK has exchanged the connect code for session tokens. Awaiting on-chain activation. |
| `active` | Agent added to Squads multisig on-chain with spending limit. Can execute transfers. |
| `paused` | Temporarily suspended (future feature). |
| `revoked` | Permanently disabled. Removed from multisig. All sessions deleted. All pending transfers denied. |

### Phase 1: Creation

**Trigger**: Human calls `mutations.agents.create({ workspaceId, name, budget })` from the UI.

**Steps**:
1. Validate name (1-32 chars), limit (> 0), user is workspace member, name is unique in workspace.
2. Insert agent record with `status: "provisioning"`.
3. Insert spending limit record with the specified budget.
4. Schedule `provisionAgent` action immediately via `ctx.scheduler.runAfter(0, ...)`.

### Phase 2: Provisioning

**Action**: `convex/actions/provisionAgent.ts`

**Steps**:
1. Load agent, check idempotency (skip if `turnkeyWalletId` already set).
2. Create Turnkey wallet: `client.createWallet({ walletName: "clawbank-agent-<id>", accounts: [{ curve: "CURVE_ED25519", path: "m/44'/501'/0'/0'", addressFormat: "ADDRESS_FORMAT_SOLANA" }] })`.
3. Extract `walletId` and `publicKey` (Solana base58 address).
4. Generate connect code via `makeConnectCode()` (6 random alphanumeric characters, 10-minute TTL).
5. Patch agent with `turnkeyWalletId`, `publicKey`, `connectCode`, `connectCodeExpiresAt`.
6. Insert `connect_code` session with SHA-256 hashed code.
7. Log `agent_created` activity.

### Phase 3: Connection (Code Exchange)

**Trigger**: Agent SDK calls `POST /agent/connect` with `{ connectCode, authPublicKey }`.

**Steps**:
1. Normalize code to uppercase, compute `sha256Hex(code)`.
2. Look up `connect_code` session by token hash, validate not expired.
3. Delete the single-use connect code session.
4. Update agent status to `"connected"`, clear connect code fields.
5. Store `authPublicKey` on agent (for DPoP verification on subsequent requests).
6. Generate access token (5-min TTL), refresh token (30-day TTL), and server salt.
7. Insert `access` and `refresh` sessions with shared `refreshTokenFamily` UUID.
8. Return tokens and metadata to the SDK.

### Phase 4: On-Chain Activation

**Trigger**: Human clicks "Activate" in the UI after agent connects.

**Steps**:
1. `buildAgentActivationTx` — Builds a Squads config transaction containing:
   - `AddMember` action (agent pubkey with `Initiate` permission only)
   - `AddSpendingLimit` action (with ephemeral `createKey`, vault index 0, token mint, amount, period)
   - `proposalCreate`, `proposalApprove`, `configTransactionExecute` instructions
   - Sponsor partial-signs as fee payer.
2. Frontend signs with Privy embedded wallet.
3. `submitAgentActivationTx` — Submits to Solana, waits for confirmation.
4. Sets agent status to `"active"`, stores `onchainCreateKey` on spending limit.
5. Logs `agent_activated_onchain`.

### Phase 5: Revocation

**Trigger**: Human clicks "Disconnect" on an agent in the UI.

**Two paths**:
- **On-chain agent** (has public key + is multisig member): Builds Squads config tx with `RemoveMember` + `RemoveSpendingLimit`, submits on-chain, then DB cleanup.
- **DB-only agent** (never activated on-chain): Skips on-chain tx, performs DB cleanup only.

**DB cleanup** (`revokeAgentInternal`):
1. Set agent status to `"revoked"`.
2. Clear connect code and expiry fields.
3. Clear `onchainCreateKey` from all spending limits.
4. Delete all `agent_sessions`.
5. Cancel all pending/pending_approval transfer requests (set to `"denied"`).
6. Log `agent_revoked` activity.

### Connect Code System

Connect codes are 6-character alphanumeric strings generated from a cryptographically secure alphabet:

```
Characters: A-Z, 0-9 (36 characters)
Length: 6 characters
Entropy: ~31 bits
TTL: 10 minutes
```

The raw code is stored on the `agents` record for UI display. The SHA-256 hash is stored in `agent_sessions` for lookup. Codes are single-use and deleted immediately upon exchange.

**Regeneration**: If a code expires, the human can click "Get New Code" which calls `generateConnectCode`, deleting old connect_code sessions and generating a fresh code.

---

## 6. Authentication

ClawBank has two parallel authentication systems: one for humans (Privy) and one for AI agents (DPoP).

### Human Authentication (Privy)

Humans authenticate via Privy using Google or email login. Privy issues JWTs validated by Convex on every authenticated function call.

**Configuration** (`convex/auth.config.ts`):
```
Provider: customJwt
Application ID: PRIVY_APP_ID
Issuer: privy.io
JWKS: https://auth.privy.io/api/v1/apps/<appId>/jwks.json
Algorithm: ES256
```

Every human gets an embedded Solana wallet created on first login (`createOnLogin: 'all-users'`).

### Agent Authentication (DPoP)

Agents authenticate via DPoP (Demonstrating Proof of Possession), implementing a variant of RFC 9449. Two protocol versions coexist:

#### v1 — Bearer Token (Legacy)

- Single `sessionToken` (32 random bytes, hex-encoded).
- 24-hour TTL.
- Sent as `Authorization: Bearer <token>`.
- No cryptographic binding. If the token is stolen, it can be used by anyone.
- Used when `authPublicKey` is NOT provided during connect.

#### v2 — DPoP (Current)

- Access token (32 random bytes hex, 5-minute TTL) + refresh token (32 random bytes hex, 30-day TTL).
- Access token sent as `Authorization: DPoP <accessToken>`.
- Every request includes a DPoP proof JWT in `X-DPoP` header.
- The proof binds the access token, HTTP method, URL, and timestamp together, signed with the agent's Ed25519 private key.
- Even if the access token is stolen, it cannot be used without the private key.

#### DPoP Proof Structure

**JWT Header**:
```json
{
  "typ": "dpop+jwt",
  "alg": "EdDSA",
  "jwk": {
    "kty": "OKP",
    "crv": "Ed25519",
    "x": "<base64url-encoded public key>"
  }
}
```

**JWT Payload**:
```json
{
  "htm": "POST",
  "htu": "https://resilient-perch-336.convex.site/agent/transfer",
  "iat": 1700000000,
  "jti": "550e8400-e29b-41d4-a716-446655440000",
  "ath": "<SHA-256 base64url hash of the access token>"
}
```

**Verification steps** (server-side, `convex/lib/dpop.ts`):
1. Split JWT into 3 parts (header, payload, signature).
2. Validate `header.typ === "dpop+jwt"` and `header.alg === "EdDSA"`.
3. Validate `payload.htm === expectedMethod` (HTTP method binding).
4. Validate `payload.htu === expectedUrl` (URL binding).
5. Validate `payload.iat` within +/- 30 seconds of server time (clock skew tolerance).
6. Validate `payload.ath === sha256Base64url(accessToken)` (access token binding).
7. Reconstruct DER-encoded Ed25519 public key from the agent's stored `authPublicKey`.
8. Verify Ed25519 signature over `headerB64.payloadB64`.
9. Store `jti` in `dpop_nonces` table with 60-second TTL (replay protection).

#### Token Rotation

On refresh (`POST /agent/refresh`):
1. Look up refresh session by hash, validate not expired.
2. Verify DPoP proof on the refresh request itself.
3. Check nonce for replay protection.
4. **Revoke ALL existing sessions** for the agent (nuclear rotation).
5. Issue new access token (5-min TTL) + refresh token (30-day TTL).
6. Increment `refreshSequence` counter.

**Theft detection**: If a stolen refresh token is used, the legitimate agent's next refresh call finds its sessions revoked, triggering re-authentication. The `refreshTokenFamily` UUID links all tokens in a rotation chain.

#### Unified Auth Middleware (`convex/lib/authMiddleware.ts`)

```typescript
authenticateAgentRequest(ctx, {
  sessionToken: string,       // The access/session token
  dpopProof?: string,         // DPoP JWT (required for v2)
  httpMethod?: string,        // HTTP method (required for v2)
  actionPath?: string,        // Full request URL (required for v2)
}): Promise<{
  agentId: Id<"agents">,
  workspaceId: Id<"workspaces">,
  sessionId: Id<"agent_sessions">,
  authVersion: "v1" | "v2",
}>
```

1. SHA-256 hash the token, look up session.
2. Validate session type is `"session"` (v1) or `"access"` (v2), and not expired.
3. If v2: verify DPoP proof and check nonce.
4. Update `lastUsedAt` timestamp.
5. Load agent to get `workspaceId`.

---

## 7. HTTP API Reference

All endpoints are served from the Convex HTTP router. Base URL for the hosted deployment: `https://resilient-perch-336.convex.site`.

### POST /agent/connect

Exchange a connect code for session tokens.

**Rate limit**: 10 attempts per minute per IP address.

**Request body**:
```json
{
  "connectCode": "GL897O",
  "authPublicKey": "base64url-encoded-32-byte-ed25519-public-key"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `connectCode` | `string` | Yes | 6-character alphanumeric code from UI |
| `authPublicKey` | `string` | No | Base64url Ed25519 public key. If provided, enables v2 DPoP auth. |

**Response (v2 — when `authPublicKey` provided)**:
```json
{
  "accessToken": "hex-string-64-chars",
  "refreshToken": "hex-string-64-chars",
  "agentId": "convex-id-string",
  "workspaceId": "convex-id-string",
  "publicKey": "base58-solana-address",
  "expiresIn": 300,
  "serverSalt": "hex-string-64-chars"
}
```

**Response (v1 — when `authPublicKey` omitted)**:
```json
{
  "sessionToken": "hex-string-64-chars",
  "agentId": "convex-id-string",
  "workspaceId": "convex-id-string",
  "publicKey": "base58-solana-address",
  "expiresAt": 1700086400000
}
```

**Errors**:
- `400` — Invalid or expired connect code, missing `connectCode`
- `429` — Rate limit exceeded

### POST /agent/refresh

Rotate access and refresh tokens (v2 only).

**Headers**:
```
Authorization: DPoP <current-access-token>
X-DPoP: <dpop-proof-jwt>
```

**Request body**:
```json
{
  "refreshToken": "hex-string-64-chars"
}
```

**Response**:
```json
{
  "accessToken": "new-hex-string-64-chars",
  "refreshToken": "new-hex-string-64-chars",
  "expiresIn": 300
}
```

**Errors**:
- `401` — Invalid tokens, expired refresh token, DPoP verification failed

### POST /agent/transfer

Execute a SOL transfer or create a multisig proposal.

**Headers**:
```
Authorization: DPoP <access-token>   (or "Bearer <session-token>" for v1)
X-DPoP: <dpop-proof-jwt>            (required for v2 only)
```

**Request body**:
```json
{
  "recipient": "base58-solana-address",
  "amountSol": 0.001,
  "shortNote": "Payment for API usage",
  "description": "Monthly payment for external API service subscription"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `recipient` | `string` | Yes | Destination Solana address (base58) |
| `amountSol` | `number` | Yes | Amount in SOL (must be > 0) |
| `shortNote` | `string` | Yes | 1-80 character summary |
| `description` | `string` | Yes | Full description |

**Response (under-limit, executed immediately)**:
```json
{
  "requestId": "convex-id-string",
  "status": "executed",
  "txSignature": "base58-solana-tx-signature"
}
```

**Response (over-limit, routed to approval)**:
```json
{
  "requestId": "convex-id-string",
  "status": "pending_approval",
  "proposalAddress": "base58-squads-proposal-pda"
}
```

**Errors**:
- `400` — Missing fields, invalid inputs, agent not active
- `401` — Invalid or expired session, DPoP verification failed

### POST /agent/status

Get agent status and spending limits.

**Headers**: Same as `/agent/transfer`.

**Request body**: `{}` (empty object)

**Response**:
```json
{
  "agentId": "convex-id-string",
  "workspaceId": "convex-id-string",
  "status": "active",
  "limits": [
    {
      "tokenMint": "So11111111111111111111111111111111111111112",
      "limitAmount": 0.001,
      "spentAmount": 0.0001,
      "periodType": "daily",
      "periodStart": 1700000000000
    }
  ]
}
```

**Errors**:
- `400` — Invalid request
- `401` — Invalid or expired session

---

## 8. Transfer System

### Decision Flow

When an agent calls `POST /agent/transfer`:

```
Authenticate session
        |
Validate inputs (recipient, amountSol > 0, shortNote 1-80 chars)
        |
Check agent status === "active"
        |
Load spending limits for SOL
        |
  checkSpendingLimit()
   /              \
  Within limit    Over limit (or no limit/no onchainCreateKey)
   |                |
  executeUnderLimit   createProposal
   |                |
  "executed"      "pending_approval"
```

### Under-Limit Path (`executeUnderLimit`)

1. Create transfer request with `status: "pending_execution"`.
2. Derive Squads `SpendingLimitPda` from multisig address + `onchainCreateKey`.
3. Build `spendingLimitUse` instruction (Squads protocol, native SOL).
4. Build versioned transaction with sponsor as fee payer.
5. Sign with sponsor (fee payer).
6. Sign with agent via Turnkey (`signWithTurnkey`).
7. Send and confirm transaction on Solana.
8. Update request to `"executed"`, record `txSignature`.
9. Increment `spentAmount` on the spending limit record.
10. Log `transfer_executed` activity.

### Over-Limit Path (`createProposal`)

1. Create transfer request with `status: "pending_approval"`.
2. Derive vault PDA (index 0).
3. Read multisig account to get next `transactionIndex`.
4. Build `SystemProgram.transfer` instruction (vault to recipient).
5. Build `vaultTransactionCreate` + `proposalCreate` instructions.
6. Sign with sponsor, sign with agent via Turnkey.
7. Send and confirm transaction.
8. Derive `proposalPda`, update request with `proposalAddress` and `proposalIndex`.
9. Log `transfer_proposal_created` activity.

### Human Approval/Denial

**Approve**: Human triggers `buildApproveTransferRequest` from the UI, which builds `proposalApprove` + `vaultTransactionExecute` instructions. Human signs with Privy wallet, then `submitTransferApproval` sends the transaction. Request status becomes `"approved"`.

**Deny**: Human triggers `denyTransferRequest`, which builds `proposalCancel` instruction. Human signs, then `submitTransferDenial` sends the transaction. Request status becomes `"denied"`.

---

## 9. Spending Limit Policy

### Backend Enforcement (`convex/lib/spendingLimitPolicy.ts`)

```typescript
checkSpendingLimit({
  spentAmount: number,      // Cumulative spend this period (SOL)
  limitAmount: number,      // Maximum per period (SOL)
  requestAmount: number,    // Requested transfer amount (SOL)
  periodStart: number,      // Period start timestamp (Unix ms)
  periodType: string,       // "daily" | "weekly" | "monthly"
  now?: number,             // Optional override for testing
}): {
  allowed: boolean,         // Whether transfer is within limit
  effectiveSpent: number,   // Actual spent (0 if period expired)
  remaining: number,        // Remaining budget
  periodExpired: boolean,   // Whether the period has rolled over
}
```

**Period durations**:
- `daily`: 86,400,000 ms (24 hours)
- `weekly`: 604,800,000 ms (7 days)
- `monthly`: 2,592,000,000 ms (30 days)

**Logic**:
- If period has expired: `effectiveSpent` resets to 0 for this decision.
- `allowed` = `requestAmount > 0 && (effectiveSpent + requestAmount) <= limitAmount`.
- Period expiry is checked by comparing `now - periodStart >= periodDuration`.

### On-Chain Enforcement (Squads v4)

Squads spending limits provide a second layer of enforcement directly on-chain:
- The spending limit is created as part of agent activation.
- Each under-limit transfer uses `spendingLimitUse` which is validated by the Squads program.
- Even if the backend policy were bypassed, the Squads program enforces the limit.
- Over-limit transfers go through `vaultTransactionCreate` which requires multisig approval.

### Conversion Helpers

```typescript
lamportsToSol(lamports: number): number   // lamports / 1,000,000,000
solToLamports(sol: number): number         // Math.round(sol * 1,000,000,000)
```

---

## 10. On-Chain Integration

### Squads v4 Multisig

Each workspace maps to a Squads v4 multisig account. The multisig controls a vault (PDA at index 0) that holds the workspace's funds.

**Workspace creation**:
- `multisigCreateV2` with all human members having `Permissions.all()` (Initiate + Vote + Execute).
- Threshold = 1 (single signature required for proposals).
- Time lock = 0.

**Agent activation** (config transaction):
- `AddMember` — Agent gets only `Initiate` permission (can propose but not approve or execute).
- `AddSpendingLimit` — Created with `vaultIndex: 0`, the token mint, amount, period, and `members: [agentPubkey]`.
- For native SOL: the `mint` field uses `PublicKey.default` (all zeros) as required by Squads protocol.

**Agent revocation** (config transaction):
- `RemoveMember` — Removes agent from multisig.
- `RemoveSpendingLimit` — Removes the spending limit (if `onchainCreateKey` exists).

### Turnkey Wallet Custody

Agent private keys are never exposed to the ClawBank backend or the agent itself. All transaction signing happens via the Turnkey API.

**Signing flow** (`convex/lib/turnkeyHelpers.ts`):
1. Serialize the transaction message to bytes.
2. Hex-encode the bytes.
3. Call Turnkey `signRawPayload({ signWith: agentSolanaAddress, payload: hexBytes, encoding: "PAYLOAD_ENCODING_HEXADECIMAL", hashFunction: "HASH_FUNCTION_NOT_APPLICABLE" })`.
4. Reconstruct Ed25519 signature from `r + s` components returned by Turnkey.
5. Place signature in the correct signer slot of the versioned transaction.

### Sponsor Fee Payer

A sponsor keypair (loaded from `SPONSOR_PRIVATE_KEY` env var, bs58-encoded 64-byte secret key) pays transaction fees. This means agents and humans don't need SOL for fees; only the vault needs funds for the actual transfers.

---

## 11. SDK Reference (@clawbank/sdk)

### Package Identity

| Field | Value |
|---|---|
| Package name | `@clawbank/sdk` |
| Version | `0.1.0` |
| License | MIT |
| Module format | ESM only |
| Node.js requirement | >= 18 |
| Runtime dependencies | None (zero-dependency) |

### Installation

```bash
npm install @clawbank/sdk
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `CLAWBANK_KEYSTORE_KEY` | Yes | Passphrase for encrypting/decrypting the local keystore file. Must be a strong passphrase. |

### Quick Start

```javascript
import { ClawBank } from "@clawbank/sdk";

// First time: connect with a code from the UI
const client = await ClawBank.connect("GL897O", {
  apiUrl: "https://resilient-perch-336.convex.site",
  keystorePath: ".clawbank",  // optional, defaults to ".clawbank"
});

// Subsequent runs: load from saved keystore
const client = await ClawBank.load({
  keystorePath: ".clawbank",
});

// Check agent status
const status = await client.status();
console.log(status.status);  // "connected" or "active"
console.log(status.limits);  // spending limit info

// Transfer SOL (requires agent to be "active")
const result = await client.transfer({
  recipient: "base58-solana-address",
  amount: 0.001,         // in SOL
  note: "Payment reason",
  description: "Detailed description of the transfer",
});

if (result.status === "executed") {
  console.log("Transaction:", result.txSignature);
} else if (result.status === "pending_approval") {
  console.log("Awaiting human approval:", result.proposalAddress);
}
```

### Public API

#### `ClawBank` Class

The main client class. Constructor is private; use static factory methods.

##### `ClawBank.connect(connectCode, opts): Promise<ClawBank>`

Register a new agent with a connect code from the UI.

| Parameter | Type | Description |
|---|---|---|
| `connectCode` | `string` | 6-character code from the ClawBank UI |
| `opts.apiUrl` | `string` | Base URL of the ClawBank API |
| `opts.keystorePath` | `string?` | File path for the encrypted keystore. Default: `".clawbank"` |

**What it does**:
1. Generates a fresh Ed25519 keypair.
2. Exchanges the connect code + public key for session tokens via `POST /agent/connect`.
3. Encrypts and saves credentials to the keystore file.
4. Returns a ready-to-use `ClawBank` instance.

**Throws**: `ClawBankApiError` if the connect code is invalid or expired.

##### `ClawBank.load(opts?): Promise<ClawBank>`

Load an existing agent from a previously saved keystore.

| Parameter | Type | Description |
|---|---|---|
| `opts.keystorePath` | `string?` | Path to the keystore file. Default: `".clawbank"` |
| `opts.apiUrl` | `string?` | Override the API URL stored in the keystore |

**Throws**: Error if keystore file doesn't exist, `CLAWBANK_KEYSTORE_KEY` is wrong, or file is corrupted.

##### `client.transfer(params): Promise<TransferResult>`

Execute a SOL transfer.

| Parameter | Type | Description |
|---|---|---|
| `params.recipient` | `string` | Destination Solana address (base58) |
| `params.amount` | `number` | Amount in SOL |
| `params.note` | `string` | Short note (1-80 chars) |
| `params.description` | `string?` | Detailed description. Defaults to `note` if omitted. |

**Returns**:
```typescript
{
  requestId: string;         // Unique request identifier
  status: string;            // "executed" or "pending_approval"
  txSignature?: string;      // Present if status === "executed"
  proposalAddress?: string;  // Present if status === "pending_approval"
}
```

##### `client.status(): Promise<StatusResult>`

Get agent status and spending limits.

**Returns**:
```typescript
{
  agentId: string;
  workspaceId: string;
  status: string;            // "provisioning" | "connected" | "active" | "paused" | "revoked"
  limits: Array<{
    tokenMint: string;
    limitAmount: number;     // Max per period (SOL)
    spentAmount: number;     // Spent this period (SOL)
    periodType: string;      // "daily" | "weekly" | "monthly"
    periodStart: number;     // Period start (Unix ms)
  }>;
}
```

#### Error Classes

##### `ClawBankApiError`

Thrown for any non-2xx HTTP response from the API.

```typescript
class ClawBankApiError extends Error {
  statusCode: number;      // HTTP status code
  responseBody: unknown;   // Parsed JSON response body
}
```

##### `AuthenticationError`

Thrown when token refresh detects session compromise (HTTP 403 on refresh).

```typescript
class AuthenticationError extends Error {
  // message: "Session compromised — refresh token reuse detected. Re-connect required."
}
```

When this error occurs, the agent must re-run `ClawBank.connect()` with a new connect code.

### Keystore

The SDK persists credentials to an encrypted file on disk.

**Encryption scheme**:
- Algorithm: AES-256-GCM
- Key derivation: scrypt (N=32768, r=8, p=1)
- Passphrase: `CLAWBANK_KEYSTORE_KEY` environment variable
- Salt: Provided by the server on connect (`serverSalt`), or random 32 bytes on token refresh saves
- IV: 12 random bytes (standard GCM nonce)
- Auth tag: 16 bytes (GCM integrity)

**File format** (JSON on disk):
```json
{
  "version": 1,
  "keyVersion": 1,
  "algorithm": "aes-256-gcm",
  "kdf": "scrypt",
  "kdfParams": { "N": 32768, "r": 8, "p": 1, "salt": "hex..." },
  "iv": "hex...",
  "ciphertext": "hex...",
  "tag": "hex...",
  "apiUrl": "https://resilient-perch-336.convex.site",
  "agentId": "convex-id-string"
}
```

The `apiUrl` and `agentId` fields are stored in plaintext (they're not secrets). The `ciphertext` contains the encrypted `KeystorePayload` which holds the private key, public key, access token, refresh token, and token expiry.

### Token Management

The SDK automatically handles token refresh:
- Access tokens are refreshed proactively when within 60 seconds of expiry.
- Concurrent refresh calls are deduplicated (only one network request).
- On 401 response, the SDK automatically refreshes and retries once.
- New tokens are persisted to the keystore file after each refresh.
- On 403 during refresh (theft detection), `AuthenticationError` is thrown.

### Field Name Mapping

The SDK maps its field names to the API's expected field names:

| SDK field | API field |
|---|---|
| `params.amount` | `amountSol` |
| `params.note` | `shortNote` |
| `params.description` | `description` |

---

## 12. Frontend Application

### Routes

| Path | Component | Description |
|---|---|---|
| `/` | `index.tsx` | Landing page with Privy login |
| `/workspaces` | `workspaces.tsx` | Main app — workspace list, drawer, modals |

### Key Flows

#### Workspace Creation

1. User clicks "Create Workspace" in `WorkspaceHeader`.
2. `CreateWorkspaceModal` opens — user enters name and optional member emails.
3. `buildCreateWorkspaceTx` builds a Squads `multisigCreateV2` transaction.
4. Privy wallet signs the transaction.
5. `submitCreateWorkspaceTx` sends it to Solana, derives addresses, stores workspace + members + invites.

#### Agent Creation (3-Step Modal)

**Step 1 — Name & Budget**:
- User enters agent name (max 32 chars), selects token, amount, and period.
- "Next" calls `mutations.agents.create` to provision the agent.

**Step 2 — Connect Code**:
- Displays the 6-character connect code with countdown timer.
- Shows `npx clawbank connect <CODE>` command.
- Copy button copies the CLI command to clipboard.
- Animated "Waiting for agent to connect..." indicator.
- Reactively polls `queries.agents.getConnectCode`.
- On code expiry: "Get New Code" button regenerates.
- When agent status changes to `"connected"`: auto-triggers activation.

**Step 3 — Activation**:
- `buildAgentActivationTx` builds the on-chain activation transaction.
- Privy wallet signs.
- `submitAgentActivationTx` confirms on Solana.
- Shows success with agent name, public key, and budget summary.

#### Transfer Approval

In `RequestsTab`, pending_approval transfer requests show Approve and Deny buttons:
- **Approve**: `buildApproveTransferRequest` -> user signs -> `submitTransferApproval`
- **Deny**: `denyTransferRequest` -> user signs -> `submitTransferDenial`

### Custom Hooks

#### `useAuth`

Wraps Privy auth state into a discriminated union:
- `AuthLoading` — Privy still initializing
- `AuthUnauthenticated` — No session
- `AuthAuthenticated` — Provides `userEmail`, `walletAddress`, `login()`, `logout()`, `exportWallet()`

#### `useSignTransaction`

Generic build -> sign -> submit pattern for all on-chain operations.

```typescript
const { status, error, isProcessing, statusLabel, execute, reset } = useSignTransaction();

const success = await execute({
  build: () => buildSomeTx(...),    // returns { serializedTx, ... }
  submit: ({ signedTx, ... }) => submitSomeTx(...),
});
```

States: `"idle"` -> `"building"` -> `"signing"` -> `"submitting"` -> `"idle"`.

#### `useWorkspaceMembers`

Merges DB members with on-chain members. Filters out agent public keys. Uses TanStack Query for on-chain data (30s stale, 2min refetch, 5min GC).

#### `useWorkspaceBalance`

TanStack Query wrapper for workspace vault balance. Returns `{ totalUsd, tokens[] }` with token metadata and USD values.

### UI Components

| Component | Description |
|---|---|
| `WorkspaceHeader` | Top bar: logo, create workspace button, export wallet, logout |
| `WorkspaceCard` | Card showing workspace name, vault address, creation date |
| `WorkspaceDrawer` | Slide-over panel with tabbed navigation (Agents, Members, Requests, Balance) |
| `AgentsTab` | Lists active agents with budget info, settings, disconnect button |
| `MembersTab` | Lists human members (excludes agents), shows invite status |
| `RequestsTab` | Lists transfer requests with expandable details, approve/deny actions |
| `AddAgentModal` | 3-step agent creation wizard |
| `EditBudgetModal` | Update spending limit (token, amount, period) |
| `CreateWorkspaceModal` | Multi-step workspace creation (name + members) |
| `DeleteMemberModal` | Confirm and execute member removal |
| `TokenListModal` | Display vault token balances |
| `BalanceHeader` | Total USD balance display |
| `WelcomeScreen` | Empty state with create workspace CTA |
| `StatusBadge` | Colored status indicator for agents and requests |
| `TokenDropdown` | Token selector from workspace balance |
| `PeriodSelector` | Daily/weekly/monthly radio selector |
| `Modal` | Base modal wrapper with backdrop and focus trap |

---

## 13. Cron Jobs

Defined in `convex/crons.ts`.

| Job | Interval | Action | Description |
|---|---|---|---|
| Cleanup expired DPoP nonces | Every 5 minutes | `internal.internals.dpopHelpers.cleanupExpiredNonces` | Deletes all rows in `dpop_nonces` where `expiresAt < Date.now()`. Prevents unbounded table growth from replay protection nonces. |

---

## 14. Rate Limiting

### Implementation (`convex/lib/rateLimit.ts`)

Sliding window rate limiter using the `agent_rate_limits` table.

```typescript
checkRateLimit(ctx, key, maxAttempts, windowMs): { allowed: boolean, remaining: number }
```

**Algorithm**:
1. Look up rate limit record by `key`.
2. If no record or window has expired: reset count to 1, allow.
3. If `count >= maxAttempts`: reject.
4. Otherwise: increment count, allow.

### Current Rate Limits

| Endpoint | Key Pattern | Max Attempts | Window |
|---|---|---|---|
| `POST /agent/connect` | `connect:<x-forwarded-for IP>` | 10 | 60 seconds |
| Workspace creation | Per-user (30s cooldown) | 1 | 30 seconds |

---

## 15. Environment Variables

### Backend (Convex) — `convex/env.ts`

| Variable | Description | Sensitive |
|---|---|---|
| `PRIVY_APP_ID` | Privy application ID for JWT verification | No |
| `RPC_URL` | Solana RPC endpoint (Helius) | No |
| `JUPITER_API_KEY` | Jupiter API key for token metadata/pricing | Yes |
| `TURNKEY_API_PUBLIC_KEY` | Turnkey API public key | No |
| `TURNKEY_API_PRIVATE_KEY` | Turnkey API private key | **Yes** |
| `TURNKEY_ORGANIZATION_ID` | Turnkey organization ID | No |
| `SPONSOR_PRIVATE_KEY` | Fee payer keypair (bs58, 64 bytes) | **Yes** |

All accessed via `requireEnv()` which throws on missing or empty values.

### Frontend — `src/env.ts`

Validated via Zod schema at startup.

| Variable | Description |
|---|---|
| `VITE_PRIVY_APP_ID` | Privy application ID |
| `VITE_CONVEX_URL` | Convex deployment URL |

### SDK

| Variable | Description |
|---|---|
| `CLAWBANK_KEYSTORE_KEY` | Passphrase for encrypting/decrypting the agent keystore file |
| `CLAWBANK_API_URL` | (Optional) Override API URL in test scripts |

---

## 16. Security Model

### Core Security Properties

1. **No raw private keys in the database**. Agent keys are custodied by Turnkey. Human keys are in Privy embedded wallets. Neither the ClawBank backend nor the agent SDK ever has access to transaction-signing keys.

2. **Tokens are never stored raw**. Session tokens, connect codes, and DPoP access/refresh tokens are stored only as SHA-256 hashes in the database. The raw token exists only in transit and in the SDK's encrypted keystore.

3. **DPoP proof binding**. Every v2 API call requires a fresh Ed25519-signed JWT that binds the HTTP method, full URL, timestamp, unique nonce (jti), and access token hash. A stolen access token is useless without the agent's Ed25519 private key.

4. **Replay protection**. DPoP `jti` values are stored in `dpop_nonces` with a 60-second TTL. Duplicate `jti` values are rejected immediately. Nonces are cleaned up every 5 minutes by cron.

5. **Token rotation with theft detection**. On refresh, ALL existing sessions for the agent are revoked before new tokens are issued. If a stolen refresh token is used, the legitimate agent's next request fails, signaling compromise. The `refreshTokenFamily` UUID and `refreshSequence` counter track the rotation chain.

6. **Policy gate on signing**. Agents cannot sign transactions directly. The backend validates the session, checks the spending limit, and only then calls Turnkey to sign. The agent has no Turnkey credentials.

7. **Dual-layer spending enforcement**. Spending limits are enforced both in the backend (policy check before signing) and on-chain (Squads spending limit program). Even if the backend were compromised, the on-chain limit would still hold.

8. **Least-privilege on-chain permissions**. Agents are added to the multisig with `Initiate` permission only — they cannot vote on or execute config changes. They can only propose vault transactions (via spending limit) or create proposals that require human approval.

9. **Encrypted keystore**. Agent credentials on disk are encrypted with AES-256-GCM using a scrypt-derived key. The passphrase (`CLAWBANK_KEYSTORE_KEY`) is a user-provided secret, not stored anywhere by ClawBank.

10. **Single-use connect codes**. Connect codes are 6-character random strings with a 10-minute TTL. They are deleted from the database immediately upon use. The code exchange endpoint is rate-limited to 10 attempts per minute per IP.

### Trust Boundaries

```
+-------------------+      +---------------------+      +------------------+
|   Agent SDK       |      |   Convex Backend    |      |   Solana Chain   |
|   (untrusted)     | ---> |   (trusted)         | ---> |   (trustless)    |
|                   |      |                     |      |                  |
| - DPoP proofs     |      | - Auth verification |      | - Squads limits  |
| - Encrypted keys  |      | - Policy checks     |      | - Multisig rules |
| - Token refresh   |      | - Turnkey signing   |      | - Program logic  |
+-------------------+      +---------------------+      +------------------+
                                     |
                                     v
                           +-------------------+
                           |   Turnkey         |
                           |   (trusted)       |
                           |                   |
                           | - Key custody     |
                           | - Tx signing      |
                           +-------------------+
```

- The **agent SDK** is untrusted. It proves identity via DPoP but has no signing authority.
- The **Convex backend** is the trusted coordinator. It validates auth, enforces policy, and orchestrates Turnkey signing.
- **Turnkey** is a trusted custodian. It holds agent private keys and signs transactions when instructed by the backend.
- **Solana** is trustless. On-chain Squads programs enforce spending limits and multisig rules regardless of the backend's behavior.
