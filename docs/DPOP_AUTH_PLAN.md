# Plan: DPoP-Style Ed25519 Agent Auth + @clawbank/sdk

## Context

The current agent auth uses a single bearer token (64-char hex, 24h TTL, no rotation). Two problems:
1. **No rotation** - agents must reconnect every 24h (defeats automation)
2. **Bearer theft** - stolen token = full agent impersonation until expiry

We're replacing it with Ed25519 DPoP (Demonstration of Proof-of-Possession): each request is cryptographically signed by the agent's local keypair, making stolen tokens useless without the private key.

## Architecture Overview

```
Agent (Node.js)                    ClawBank Backend (Convex)
---------------------              --------------------------
@clawbank/sdk                      convex/http.ts (httpRouter)
  |-- keypair.ts (Ed25519)           |-- POST /agent/connect
  |-- keystore.ts (AES-256-GCM)     |-- POST /agent/refresh
  |-- dpop.ts (JWT signing)          |-- POST /agent/sign
  |-- tokens.ts (auto-refresh)       |-- POST /agent/status
  '-- client.ts (public API)         '-- POST /agent/disconnect
                                   convex/lib/dpop.ts (JWT verification)
                                   convex/lib/authMiddleware.ts (v1/v2)
```

Every request carries:
- `Authorization: DPoP <short-lived-access-token>` (5 min)
- `X-DPoP: <signed-JWT>` binding method, URL, timestamp, nonce, and token hash

---

## Workstream 1: Convex Backend Changes

### 1.1 Schema Changes -- convex/schema.ts

**agents table** -- add field:
- `authPublicKey: v.optional(v.string())` -- base64url Ed25519 public key for DPoP verification

**agent_sessions table** -- add fields + session types:
- `sessionType` gains two new literals: `"access"`, `"refresh"`
- `authVersion: v.optional(v.union(v.literal("v1"), v.literal("v2")))` -- defaults v1 for existing rows
- `refreshTokenFamily: v.optional(v.string())` -- UUID linking access/refresh token pairs
- `refreshSequence: v.optional(v.number())` -- monotonic counter for theft detection
- New index: `by_refreshFamily: ["refreshTokenFamily"]`

**New table dpop_nonces** -- jti replay prevention:
- `jti: v.string()`, `agentId: v.id("agents")`, `expiresAt: v.number()`
- Indexes: `by_jti: ["jti"]`, `by_expiresAt: ["expiresAt"]`

**New table agent_rate_limits** -- sliding window rate limiting:
- `key: v.string()`, `windowStart: v.number()`, `count: v.number()`
- Index: `by_key: ["key"]`

### 1.2 New File -- convex/lib/dpop.ts

DPoP JWT verification (runs in "use node" environment):
- `verifyDPoPProof(jwt, publicKey, expectedMethod, expectedUrl, accessToken)` returns `{ valid, error?, payload? }`
- Verifies: alg=EdDSA, typ=dpop+jwt, htm/htu match, iat within 30s, ath matches SHA-256 of access token
- Ed25519 verification via Node.js `crypto.verify("ed25519", ...)`
- Helper exports: `base64urlEncode`, `base64urlDecode`, `sha256Base64url`

### 1.3 New File -- convex/lib/authMiddleware.ts

Unified auth extraction for v1 (bearer-only) and v2 (DPoP):
- `authenticateAgentRequest(ctx, { sessionToken, dpopProof?, httpMethod?, actionPath? })` returns `{ agentId, workspaceId, sessionId, authVersion }`
- Checks session's authVersion: if v2, requires + verifies DPoP; if v1, existing bearer logic
- Reused by all authenticated endpoints

### 1.4 New File -- convex/lib/rateLimit.ts

- `checkRateLimit(ctx, key, maxAttempts, windowMs)` returns `{ allowed, remaining }`
- Uses agent_rate_limits table with sliding window
- Connect endpoint: max 5 per 10 min per code
- API endpoints: max 60 per minute per agent

### 1.5 New File -- convex/internals/dpopHelpers.ts

Internal mutations/queries:
- `checkAndStoreNonce(jti, agentId)` -- reject if exists, insert with 60s TTL
- `cleanupExpiredNonces()` -- scheduled mutation (cron every 5 min)
- `revokeAllAgentSessions(agentId)` -- delete all sessions (theft response)

### 1.6 New File -- convex/http.ts -- HTTP Router

Convex httpRouter with 5 endpoints. This replaces the `POST /api/action` pattern for agents, giving us access to HTTP headers (required for DPoP):

- `POST /agent/connect` -- exchange code + register public key, returns access + refresh tokens
- `POST /agent/refresh` -- DPoP-bound token refresh with rotation + theft detection
- `POST /agent/sign` -- DPoP-authenticated generic tx signing (agent sends any serialized tx, backend signs with agent's Turnkey wallet + sponsor, returns signed tx). Replaces the old transfer-specific endpoint. User-defined policies will gate what transactions are allowed (future work).
- `POST /agent/status` -- DPoP-authenticated status check
- `POST /agent/disconnect` -- revoke all sessions

Each handler extracts Authorization + X-DPoP headers from the request, delegates to internal actions.

### 1.7 Modified File -- convex/actions/agentAuth.ts

Extend exchangeConnectCode to accept optional authPublicKey:
- If present: v2 flow -- validate key is 32 bytes, store on agent, generate access (5 min) + refresh (30 days) tokens, return serverSalt for keystore encryption
- If absent: v1 flow -- existing logic unchanged (backwards compat)

### 1.8 New File -- convex/actions/agentRefresh.ts

- Validates refresh token hash + DPoP proof
- Checks refreshSequence matches expected -- if not, **theft detected**: revoke ALL sessions
- Rotates: delete old tokens, create new access + refresh, increment sequence
- Returns new token pair

### 1.9 New File -- convex/crons.ts

Scheduled job to clean up expired dpop_nonces every 5 minutes.

---

## Workstream 2: @clawbank/sdk (Separate Repo)

### 2.1 Repo Structure

```
clawbank-sdk/
  package.json          # @clawbank/sdk, zero runtime deps, Node >=18
  tsconfig.json
  vitest.config.ts
  src/
    index.ts            # Public exports
    client.ts           # ClawBank class (public API)
    auth/
      keypair.ts        # Ed25519 via Node.js crypto
      keystore.ts       # Encrypted file (AES-256-GCM + scrypt)
      dpop.ts           # DPoP JWT creation
      tokens.ts         # TokenManager (auto-refresh)
    api/
      transport.ts      # HTTP fetch + header injection
      endpoints.ts      # Typed endpoint definitions
    types.ts            # Public interfaces
    errors.ts           # ClawBankApiError, AuthenticationError
  tests/
    keypair.test.ts
    keystore.test.ts
    dpop.test.ts
    tokens.test.ts
    client.test.ts
```

Zero runtime dependencies -- pure Node.js crypto and fs.

### 2.2 Keypair Generation -- src/auth/keypair.ts

- `generateKeypair()` returns `{ publicKey: Uint8Array(32), privateKey: Uint8Array(32) }`
- Uses `crypto.generateKeyPairSync("ed25519")`, extracts raw bytes from DER
- `publicKeyToBase64url(key)` for wire format

### 2.3 Encrypted Keystore -- src/auth/keystore.ts

**File format** (.clawbank JSON):
```json
{
  "version": 1,
  "keyVersion": 1,
  "algorithm": "aes-256-gcm",
  "kdf": "scrypt",
  "kdfParams": { "N": 32768, "r": 8, "p": 1, "salt": "<hex-32-bytes>" },
  "iv": "<hex-12-bytes>",
  "ciphertext": "<hex>",
  "tag": "<hex-16-bytes>",
  "apiUrl": "https://...",
  "agentId": "..."
}
```

**Encryption key derivation**:
- On connect: `scrypt(connectCode + CLAWBANK_KEYSTORE_KEY, serverSalt, 32)`
- On subsequent loads: `scrypt(CLAWBANK_KEYSTORE_KEY, salt_from_file, 32)`
- CLAWBANK_KEYSTORE_KEY env var is **required** -- clear error if missing
- keyVersion field enables future key rotation

**Plaintext payload** (inside ciphertext):
```json
{
  "privateKey": "<base64url-32-bytes>",
  "publicKey": "<base64url-32-bytes>",
  "accessToken": "...",
  "refreshToken": "...",
  "accessTokenExpiresAt": 1708700000000
}
```

Cross-platform note: AES-256-GCM + scrypt + hex/base64url encoding works in Python (cryptography lib), Go (x/crypto), Rust, etc. for future SDKs.

### 2.4 DPoP Proof Creation -- src/auth/dpop.ts

`createDPoPProof({ method, url, accessToken, privateKey, publicKey })` returns JWT string

JWT structure:
- **Header**: `{ typ: "dpop+jwt", alg: "EdDSA", jwk: { kty: "OKP", crv: "Ed25519", x: "<base64url>" } }`
- **Payload**: `{ htm, htu, iat, jti: crypto.randomUUID(), ath: sha256Base64url(accessToken) }`
- **Signature**: Ed25519 sign via `crypto.sign(null, signingInput, privateKeyObject)`

### 2.5 Token Manager -- src/auth/tokens.ts

TokenManager class:
- `getValidAccessToken()` -- returns current token, auto-refreshes if expiring within 60s
- Deduplicates concurrent refresh calls (single in-flight promise)
- On refresh: creates DPoP proof for /agent/refresh, posts with refresh token
- Persists updated tokens to encrypted keystore after each refresh
- On 403 (theft detected): throws AuthenticationError, agent must re-connect

### 2.6 Public API -- src/client.ts

```typescript
// Connect a new agent
const client = await ClawBank.connect("A3F9K2", { apiUrl: "..." });

// Load existing session
const client = await ClawBank.load({ keystorePath: ".clawbank" });

// Sign any transaction (generic -- agent builds the tx, backend signs it)
const { signedTx } = await client.sign({
  transaction: serializedTx,       // base64 VersionedTransaction
  description: "Transfer 0.5 SOL"  // human-readable audit trail
});

// Check agent status + spending limits
const status = await client.status();

// Disconnect (revoke all sessions)
await client.disconnect();
```

### 2.7 HTTP Transport -- src/api/transport.ts

Every request:
1. Gets valid access token from TokenManager (auto-refresh)
2. Creates DPoP proof for the specific method + path
3. Sends with `Authorization: DPoP <token>` + `X-DPoP: <jwt>` headers
4. On 401: retry once after token refresh
5. Typed error handling via ClawBankApiError

---

## Workstream 3: Migration

### Phase 1 -- Backend accepts both v1 and v2 (no breaking changes)
- Deploy schema changes (all new fields are v.optional)
- Deploy convex/http.ts router
- Existing agents continue working via POST /api/action with bearer tokens

### Phase 2 -- Publish SDK
- Publish @clawbank/sdk to npm
- New agents use SDK and get v2 auth automatically
- Update docs with SDK-based setup instructions

### Phase 3 -- Deprecation of v1
- Add X-ClawBank-Deprecation header to v1 responses
- Provide `npx @clawbank/sdk migrate` command for existing agents
- After sunset date, reject v1 sessions

---

## API Contracts

### POST /agent/connect
```
Body: { connectCode: "A3F9K2", authPublicKey: "base64url-32-bytes" }

200: {
  accessToken: "hex-64",
  refreshToken: "hex-64",
  agentId: "...",
  workspaceId: "...",
  publicKey: "solana-base58",
  expiresIn: 300,
  serverSalt: "hex-32"
}
```

### POST /agent/refresh
```
Headers: Authorization: DPoP <token>, X-DPoP: <jwt>
Body: { refreshToken: "..." }

200: { accessToken, refreshToken, expiresIn: 300 }
403: { error: "refresh_token_reuse" }  (all sessions revoked)
```

### POST /agent/sign
```
Headers: Authorization: DPoP <token>, X-DPoP: <jwt>
Body: {
  serializedTx: "<base64-encoded VersionedTransaction>",
  description: "Human-readable description of what this tx does"
}

200: {
  signedTx: "<base64-encoded signed tx>",
  agentSignature: true,
  sponsorSignature: true
}

403: { error: "policy_violation", message: "Transaction rejected by policy" }
```

The agent builds any Solana transaction it needs, sends the unsigned (or partially signed)
tx to /agent/sign. The backend:
1. Authenticates via DPoP
2. Runs the tx through policy checks (future: user-defined policies)
3. Signs with the agent's Turnkey wallet (signWithTurnkey)
4. Signs with the sponsor keypair (fee-payer)
5. Returns the fully signed tx (agent or backend can submit to Solana)

This is a generic signing endpoint -- not transfer-specific. The agent can build
any transaction (token transfers, NFT mints, DeFi interactions, etc.)
and the policy layer gates what's allowed.

### POST /agent/status
```
Headers: Authorization: DPoP <token>, X-DPoP: <jwt>
Body: {}

200: { agentId, workspaceId, status, limits[] }
```

### POST /agent/disconnect
```
Headers: Authorization: DPoP <token>, X-DPoP: <jwt>
Body: {}

200: { disconnected: true }
```

---

## Implementation Order

**Backend first (clawbank-app repo):**
1. convex/schema.ts -- new fields + tables
2. convex/lib/dpop.ts -- DPoP verification (unit-testable)
3. convex/lib/rateLimit.ts -- rate limiting
4. convex/internals/dpopHelpers.ts -- nonce + session helpers
5. convex/lib/authMiddleware.ts -- unified v1/v2 auth
6. convex/actions/agentAuth.ts -- extend exchangeConnectCode for v2
7. convex/actions/agentRefresh.ts -- new refresh action
8. convex/http.ts -- HTTP router (5 endpoints)
9. convex/crons.ts -- nonce cleanup

**SDK (separate clawbank-sdk repo):**
10. src/auth/keypair.ts -- Ed25519 generation
11. src/auth/keystore.ts -- encrypted storage
12. src/auth/dpop.ts -- JWT creation
13. src/auth/tokens.ts -- token lifecycle
14. src/api/transport.ts -- HTTP layer
15. src/client.ts -- public API
16. Tests for all modules

---

## Verification

1. **Unit tests**: DPoP sign/verify round-trip, keystore encrypt/decrypt, token refresh logic, nonce replay rejection, rate limit enforcement
2. **Integration test**: ClawBank.connect(code) then client.transfer() -- verify DPoP headers are sent and validated
3. **Security tests**: replay a captured DPoP JWT (should fail), use expired access token (should fail), reuse refresh token (should revoke all sessions)
4. **Migration test**: v1 bearer token still works alongside v2 DPoP sessions
5. **Build verification**: npm run typecheck && npm test && npm run build in both repos
