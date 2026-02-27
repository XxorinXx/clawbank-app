# Security Audit: ClawBank Connect Flow

**Date:** 2026-02-24
**Scope:** Connect flow (`convex/http.ts`, `convex/actions/agent*.ts`, `convex/lib/`) + SDK (`clawbank-sdk/src/`)

---

## Overall Assessment

The auth system is well-designed with strong cryptographic foundations. DPoP + token rotation + encrypted keystore is a solid stack. That said, several vulnerabilities were identified ranging from medium to low severity.

---

## MEDIUM Severity

### 1. Rate limit bypass via `x-forwarded-for` spoofing

**File:** `convex/http.ts:35`

```typescript
key: `connect:${request.headers.get("x-forwarded-for") ?? "unknown"}`
```

An attacker can rotate the `X-Forwarded-For` header to bypass the 10-attempt rate limit entirely. Each spoofed IP gets its own fresh window. This makes the 6-character connect code (36^6 = ~2.1 billion combinations) brute-forceable if the attacker can issue enough requests.

**Fix:** Use a trusted client IP from your infrastructure (Convex may provide one), or add a secondary rate limit on the `connectCode` hash itself so the same code can't be guessed more than N times total.

---

### 2. `agentTransfer` re-authenticates independently without DPoP

**File:** `convex/actions/agentTransfer.ts:39-53`

The transfer action does its own token lookup by hashing the session token, but it **never verifies DPoP** for v2 sessions. The `authenticateRequest` in `http.ts` does verify DPoP, but then the raw `sessionToken` is passed to `agentTransfer` which only checks the hash — meaning the DPoP verification is separated from the action that actually authorizes the financial operation. If there's ever a code path that calls `agentTransfer` directly (e.g. internal invocation, future endpoint), the DPoP check is skipped entirely.

**Fix:** Either pass the already-authenticated `agentId`/`sessionId` from the HTTP handler to the transfer action (trusted internal call), or have `agentTransfer` itself enforce DPoP. Right now the auth is split across two layers without a clear contract.

---

### 3. 401 retry in SDK doesn't actually force a refresh

**File:** `clawbank-sdk/src/api/transport.ts:41-44`

```typescript
if (response.status === 401 && !isRetry) {
  await this.tokenManager.getValidAccessToken(); // triggers refresh
  return this.doRequest<T>(method, path, body, true);
}
```

`getValidAccessToken()` only refreshes if the token is within 60s of expiry. If the server returns 401 for other reasons (revoked session, etc.) but the token hasn't technically "expired" client-side, this retry will use the same invalid token and fail again silently.

**Fix:** Add a `forceRefresh()` method to `TokenManager` and call it on 401 instead of `getValidAccessToken()`.

---

## LOW Severity

### 4. Connect code entropy has no per-code attempt limit

**File:** `convex/lib/connectCode.ts`

The 6-char alphanumeric code has ~31 bits of entropy. Combined with the rate limit bypass above, an attacker could realistically brute-force active connect codes. The 10-minute TTL helps, but without per-code rate limiting, the window is still exploitable.

**Fix:** Add a per-code attempt counter (increment on each failed lookup for a given hash prefix, or track failed attempts in the connect code session).

---

### 5. DPoP nonce cleanup cron may not be scheduled

**Files:** `convex/internals/dpopHelpers.ts:16` + `convex/lib/dpop.ts:84`

The DPoP timestamp allows a 30-second window, but nonces only expire after 60 seconds. The gap is correct (nonces outlive the acceptance window), but after 60 seconds nonces are garbage-collected. The `cleanupExpiredNonces` mutation exists but **must be scheduled via a Convex cron** or the `dpop_nonces` table will grow unbounded.

**Action:** Verify `cleanupExpiredNonces` is scheduled in `convex/crons.ts`. If not, add it.

---

### 6. No `jti` format validation

**File:** `convex/internals/dpopHelpers.ts:6-11`

The server stores whatever `jti` the client sends without validating its format. A malicious client could send extremely long `jti` strings to bloat the nonces table.

**Fix:** Validate `jti` is a UUID or has a max length (e.g. 64 chars).

---

### 7. DPoP `htu` (URL) comparison is exact string match

**File:** `convex/lib/dpop.ts:75-76`

```typescript
if (payload.htu !== expectedUrl) {
```

If Convex adds/strips trailing slashes, query params, or rewrites URLs between what `request.url` returns and what the SDK sends, DPoP will silently break or — worse — could be bypassed if URL normalization differs between client and server.

**Fix:** Normalize URLs before comparison (parse, compare origin + path, ignore query/fragment).

---

### 8. Keystore file permissions not set

**File:** `clawbank-sdk/src/auth/keystore.ts:59`

`fs.writeFileSync` creates the file with the default umask (often `0644`), meaning other users on the same machine can read the encrypted keystore. While it's encrypted, reducing exposure is defense-in-depth.

**Fix:** Set file mode to `0600`:

```typescript
fs.writeFileSync(path, data, { mode: 0o600 });
```

---

### 9. v1 bearer auth still accepted

**File:** `convex/lib/authMiddleware.ts:45`

```typescript
const authVersion = session.authVersion ?? "v1";
```

Sessions without `authVersion` default to v1, which skips all DPoP verification. If there are any legacy v1 sessions or a way to create sessions without `authVersion`, the entire DPoP security layer is bypassed.

**Fix:** If v1 is deprecated, add a hard deadline to reject v1 sessions. At minimum, log/alert on v1 usage.

---

## Strengths

- **Token hashing** (SHA-256) before storage — never stores plaintext tokens
- **DPoP with Ed25519** — cryptographically binds tokens to the holder's private key
- **Token rotation on refresh** with family tracking — stolen refresh tokens trigger full session revocation
- **AES-256-GCM + scrypt** keystore encryption — strong at-rest protection
- **Single-use connect codes** — prevents code sharing/replay
- **Spending limit enforcement** with snapshot auditing
- **Nonce replay protection** — DPoP `jti` tracked server-side
- **Generic error messages** — doesn't leak implementation details

---

## Recommended Priority Actions

| Priority | Issue | Effort |
|----------|-------|--------|
| **P0** | Fix rate limit bypass (spoofable `x-forwarded-for`) | Low |
| **P0** | Unify DPoP verification so `agentTransfer` doesn't re-auth without DPoP | Medium |
| **P1** | Add `forceRefresh()` to the SDK's 401 retry path | Low |
| **P1** | Set keystore file permissions to `0600` | Trivial |
| **P1** | Schedule `cleanupExpiredNonces` cron if not already running | Trivial |
| **P2** | Plan v1 deprecation to eliminate the DPoP bypass path | Medium |
| **P2** | Add per-code attempt limit for connect codes | Low |
| **P2** | Validate `jti` format/length | Trivial |
| **P3** | Normalize DPoP `htu` URL comparison | Low |
