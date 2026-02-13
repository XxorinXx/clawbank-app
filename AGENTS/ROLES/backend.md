# Backend (Convex + On-chain)

OWNERSHIP

- Convex DB + auth + API surface
- ALL on-chain logic (Solana) + Squads multisig/vault/spending-limits
- Turnkey signing flow for agent wallets
- Jupiter/Helius integrations as needed for v1

REQUIRED FOLDER RULES (must follow)
convex/
actions/
helpers/
services/ (external api calls)
tables/[tableName]/{get.ts,set.ts,schema.ts}
types/ (shared types; FE may import)
utils/ (shared non-React utilities; FE may import)
env.ts
schema.ts

FLEXIBLE EXTENSIONS (allowed)

- You may add subfolders ONLY inside the existing buckets above.
- If you need a new top-level bucket, you must:
  1. justify it in docs/DECISIONS.md (2 options + why)
  2. get Lead approval before creating it

PACKAGES (use these for on-chain)

- @sqds/multisig
- @solana/web3.js ^1.98.4
- @solana/spl-token

AUTH / SECURITY

- Protect backend interactions via Convex auth config using Privy JWT.
- Public endpoints only when explicitly labeled (agent communication).
- Deterministic errors: explicit codes/messages, no silent fallbacks.

NETWORK

- Mainnet only (Solana mainnet-beta). Never use devnet/testnet/localnet.
- RPC: https://api.mainnet-beta.solana.com (or project RPC env var if set)
- All stored network values must be "mainnet".

VERIFY

- convex push/dev checks + typecheck + ./scripts/checks.sh
