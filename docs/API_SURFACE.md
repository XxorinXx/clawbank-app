# ClawBank API Surface

> **This is the single source of truth for all HTTP endpoints the SDK consumes.**
> Any endpoint change in `convex/http.ts` MUST be reflected here.
> The `clawbank-sdk` repo references this file.

Base URL: `https://resilient-perch-336.convex.site`

All endpoints are `POST`. All request/response bodies are JSON.

---

## `POST /agent/connect`

Exchange a one-time connect code for session tokens. **Unauthenticated.**

Rate limit: 10 attempts/min per IP.

**Request:**
```json
{
  "connectCode": "GL897O",
  "authPublicKey": "base64url-ed25519-public-key"  // optional, enables v2/DPoP
}
```

**Response (v2 — authPublicKey provided):**
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

**Response (v1 — no authPublicKey):**
```json
{
  "sessionToken": "hex-64",
  "agentId": "...",
  "workspaceId": "...",
  "publicKey": "base58",
  "expiresAt": 1700086400000
}
```

**Errors:** `400` (invalid/expired code), `429` (rate limit)

---

## `POST /agent/refresh`

Rotate access + refresh tokens. **v2/DPoP only.** Full token rotation — all existing sessions revoked before new ones issued (refresh token family reuse detection).

**Headers:**
```
Authorization: DPoP <access-token>
X-DPoP: <dpop-proof-jwt>
```

**Request:**
```json
{ "refreshToken": "hex-64" }
```

**Response:**
```json
{
  "accessToken": "new-hex-64",
  "refreshToken": "new-hex-64",
  "expiresIn": 300
}
```

**Errors:** `401` (invalid/expired tokens, DPoP failed), `403` (refresh token reuse — session compromised, triggers `AuthenticationError` in SDK)

---

## `POST /agent/transfer`

Execute a SOL transfer (within spending limit) or create a Squads multisig proposal (over limit).

**Headers:**
```
Authorization: DPoP <access-token>   (or "Bearer <token>" for v1)
X-DPoP: <dpop-proof-jwt>            (required for v2)
```

**Request:**
```json
{
  "recipient": "base58-solana-address",
  "amountSol": 0.001,
  "shortNote": "Payment reason (1-80 chars)",
  "description": "Full description text"
}
```

**Response (executed — within limit):**
```json
{
  "requestId": "convex-id",
  "status": "executed",
  "txSignature": "base58-signature"
}
```

**Response (pending — over limit):**
```json
{
  "requestId": "convex-id",
  "status": "pending_approval",
  "proposalAddress": "base58-squads-proposal-pda"
}
```

**Validation:** `shortNote` 1-80 chars, `description` non-empty, `amountSol > 0`, valid base58 recipient, agent `status === "active"`.

**Errors:** `400` (validation), `401` (auth), `403` (inactive agent)

---

## `POST /agent/execute`

Execute arbitrary Solana instructions through the vault. Within spending limit: auto-executes via Squads vault transaction. Over limit: creates a proposal for human approval.

**Headers:**
```
Authorization: DPoP <access-token>   (or "Bearer <token>" for v1)
X-DPoP: <dpop-proof-jwt>            (required for v2)
```

**Request:**
```json
{
  "instructions": [
    {
      "programId": "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
      "keys": [
        { "pubkey": "VAULT_PDA", "isSigner": false, "isWritable": true },
        { "pubkey": "base58-address", "isSigner": false, "isWritable": false }
      ],
      "data": "base64-encoded-instruction-data"
    }
  ],
  "shortNote": "Swap 0.5 SOL for USDC (1-80 chars)",
  "description": "Jupiter swap via SOL/USDC route",
  "estimatedValueSol": 0.5
}
```

- `instructions`: Array of 1-5 Solana instructions. Use `"VAULT_PDA"` as a placeholder for the vault address (auto-replaced).
- `shortNote`: 1-80 character summary.
- `description`: Full description (non-empty). Defaults to `shortNote` if omitted.
- `estimatedValueSol`: Estimated SOL value of the transaction (for spending limit check). Must be >= 0.

**Program allowlist:** Only instructions targeting allowed programs are accepted. Default allowlist: System Program, Token Program, Associated Token Program, Jupiter v6, Compute Budget.

**Response (executed -- within limit):**
```json
{
  "requestId": "convex-id",
  "status": "executed",
  "txSignature": "base58-signature"
}
```

**Response (pending -- over limit):**
```json
{
  "requestId": "convex-id",
  "status": "pending_approval",
  "proposalAddress": "base58-squads-proposal-pda"
}
```

**Errors:** `400` (validation, disallowed program, instruction limit), `401` (auth), `403` (inactive agent), `429` (rate limit)

---

## `POST /agent/status`

Get agent status and spending limits.

**Headers:** Same as `/agent/transfer`.

**Request:** `{}` (empty JSON)

**Response:**
```json
{
  "agentId": "convex-id",
  "workspaceId": "convex-id",
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

**Errors:** `401` (auth)

---

## Authentication

All authenticated endpoints use DPoP (v2) or Bearer (v1) auth:

1. SDK gets access token from `/agent/connect`
2. Each request includes `Authorization: DPoP <token>` + `X-DPoP: <proof-jwt>`
3. DPoP proof is an Ed25519-signed JWT with `htm`, `htu`, `iat`, `jti`, `ath` claims
4. Access tokens expire in 300s — SDK auto-refreshes via `/agent/refresh`
5. Refresh token reuse (replay) triggers `403` and session revocation
