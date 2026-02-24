# Agent Auth Replacement Options

You identified two problems with the current bearer-token auth:

1. **No token rotation** - agents must reconnect every 24h, defeating the purpose of automation
2. **Bearer token theft** - anyone with the token can impersonate the agent and initiate transactions

Here are 4 alternative flows. Each solves both problems.

---

## Option A: Refresh Token Rotation (Simplest Change)

**How it works:**
- On connect, agent gets TWO tokens: a short-lived **access token** (5 min) and a long-lived **refresh token** (30 days)
- Agent uses access token for every API call
- When access token expires, agent calls a `/refresh` endpoint with the refresh token -> gets a new access + refresh pair
- Old refresh token is invalidated (single-use rotation)
- If a refresh token is reused (theft detected), **all sessions for that agent are revoked**

**What it solves:**
- Token rotation: automatic, no human intervention
- Stolen access token: only useful for 5 minutes
- Stolen refresh token: single-use, so the real agent's next refresh fails -> triggers conflict detection

**Tradeoff:** Still a bearer token. If both tokens are stolen at once (file exfiltrated), attacker has a 30-day window until the real agent tries to refresh and triggers conflict detection.

---

## Option B: HMAC Request Signing (No Bearer Token At All)

**How it works:**
- On connect, agent receives a **signing secret** (never sent again over the wire)
- Every request, agent computes: `HMAC-SHA256(secret, timestamp + method + path + body)`
- Sends the signature + timestamp in headers
- Backend recomputes the HMAC and compares
- Requests older than 30 seconds are rejected (replay protection)

**What it solves:**
- No token in transit - even if someone intercepts a request, the signature is one-time and time-bound
- Token theft: attacker needs the signing secret from disk, not just a network sniff
- No expiry/rotation needed - the secret doesn't expire, but it's never transmitted after initial setup

**Tradeoff:** If `.clawbank` file is stolen, attacker has the secret. Same as Option A. The real improvement is in-transit security (no replayable bearer token on the wire).

---

## Option C: Agent Signs With Its Own Turnkey Wallet (Strongest)

**How it works:**
- The agent already has a Solana keypair in Turnkey
- Instead of a bearer token, make the agent **sign a challenge** to prove identity
- Flow: Agent calls `/challenge` -> backend returns a random nonce -> agent signs the nonce with its Turnkey wallet -> backend verifies the Ed25519 signature matches the agent's known public key
- Returns a short-lived access token (5 min), auto-refreshed via new challenge-response

**What it solves:**
- No shared secret at all - the agent proves it controls its private key
- Stolen token: only valid for 5 minutes, can't forge new ones without Turnkey access
- True cryptographic identity - not "who has this string" but "who controls this key"

**Tradeoff:** The agent would need to call Turnkey directly to sign challenges. Right now the agent doesn't talk to Turnkey - your backend does. This means either:
- Give the agent its own Turnkey API credentials (adds complexity, another secret to protect)
- Or use a lighter scheme: agent gets a local Ed25519 keypair (separate from the on-chain Turnkey key) just for auth signing

---

## Option D: x402 Protocol (Pay-Per-Request, Most Novel)

**How it works:**
- Your ClawBank API becomes an **x402-enabled server**
- When the agent calls any endpoint without payment proof, backend returns `HTTP 402` with a `PaymentRequired` header (specifying price per call, e.g. 100 lamports)
- The agent signs a payment payload with its wallet (proving identity AND paying the fee)
- Backend verifies the signature + settles the micropayment on Solana
- Request proceeds

**What it solves:**
- Auth + monetization in one - the cryptographic signature IS the authentication, and it pays you at the same time
- No session tokens at all - every request is independently authenticated via wallet signature
- Stolen tokens are impossible - there are no tokens, just signatures
- Per-request fee is baked into the protocol

**Tradeoff:**
- Every API call = an on-chain transaction (even at $0.00025/tx, this adds latency of ~400ms per call)
- The agent needs to sign locally, so it needs either its own Turnkey API access or a local keypair
- x402 is still early - the Solana/SVM SDK (`@x402/svm`) exists but the ecosystem is young
- Adds a dependency on Coinbase's facilitator infrastructure (or you run your own)

---

## Quick Comparison

| | Rotation | Theft Protection | Monetization | Complexity |
|---|---|---|---|---|
| **A: Refresh tokens** | Auto | 5-min window | Separate | Low |
| **B: HMAC signing** | Not needed | No replay | Separate | Medium |
| **C: Turnkey challenge** | Auto | Cryptographic | Separate | Medium-High |
| **D: x402 pay-per-request** | Not needed | Cryptographic | Built-in | High |

## Recommendation

- **Option A** if you want a quick win
- **Option C** if you want real security without changing third-party deps
- **Option D** is the most interesting long-term since it solves auth + monetization together, but it's the biggest lift and x402 is still maturing

## Sources

- [x402 Whitepaper](https://www.x402.org/x402-whitepaper.pdf)
- [x402 GitHub (Coinbase)](https://github.com/coinbase/x402)
- [x402 on Solana](https://solana.com/x402/what-is-x402)
