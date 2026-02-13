# Security Review Checklist — Agent Connect

> Scope: AI-agent wallet connection, session management, and spend authorization via Squads multisig on Solana.

---

## 1. Secret Handling + Logging

- [ ] Turnkey API key stored only in Convex env vars, never logged or returned to client
- [ ] Agent session tokens (JWT) signed with server-side secret, never logged
- [ ] Connect codes are single-use and expire after 10 minutes
- [ ] No private keys stored in Convex DB — only Turnkey wallet IDs and public keys
- [ ] Sponsor key never exposed to agents or frontend
- [ ] All error messages are generic (no key material in stack traces)

## 2. Auth + Replay Prevention

- [ ] Every agent API call requires valid Bearer JWT token
- [ ] JWT contains `agentId` + `workspaceId` + `exp` claim
- [ ] Spend requests include a unique nonce (UUID v4) — backend rejects duplicates
- [ ] Nonce tracked per agent with 24-hour dedup window
- [ ] Connect codes are invalidated immediately after use
- [ ] Session tokens are revoked when agent is disconnected

## 3. Principle of Least Privilege

- [ ] Agent can only access its own workspace (`workspaceId` in JWT)
- [ ] Agent cannot read other agents' data
- [ ] Agent cannot modify workspace settings or member list
- [ ] Agent wallet has minimal Squads permissions (initiate only, not vote/execute for config)
- [ ] Turnkey wallet signing is gated by backend policy — agent cannot sign directly

## 4. Abuse / Rate Limiting

- [ ] Spend requests rate-limited per agent (e.g. 10/minute for DDoS protection)
- [ ] Connect code generation rate-limited per workspace (e.g. 5/hour)
- [ ] Failed auth attempts tracked and throttled
- [ ] Budget enforcement is double-checked: backend policy gate + Squads spending limit on-chain
- [ ] Agent cannot exceed budget even if backend is bypassed (Squads enforces on-chain)

## 5. Happy-Path Demo Protection

- [ ] Demo/test agents cannot be created on mainnet workspaces without explicit human approval
- [ ] Default spending limit for new agents is conservative (suggest $10/day equivalent)
- [ ] First spend by new agent requires human confirmation (one-time unlock)
- [ ] Activity log captures all agent actions for audit
- [ ] Humans can freeze agent instantly (revoke sessions + remove Squads membership)
