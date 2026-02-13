# GLOBAL (read every run)

GOAL: Ship ClawBank v1 vertical slices deterministically. Repo files are the only memory.

NETWORK POLICY: Mainnet only (Solana mainnet-beta). No devnet, no testnet, no localnet. All on-chain operations, RPC calls, and stored network values must use mainnet.

PRIVY POLICY: We use Privy v2 (@privy-io/react-auth ^2.25.0). Do NOT use v3 or import from @privy-io/react-auth/solana (v3 submodule). All Solana wallet hooks come from the top-level @privy-io/react-auth import (e.g. useSolanaWallets). Never add @solana-program/* or @solana/kit packages.

RULES

- Minimal context: read only files listed in "Inputs" for the current story.
- One micro-story per PR/commit. No parallel work unless Lead authorizes.
- Do not paste large code into chat; change code in repo.
- Every story must end with: tests + checks green + completion marker written.
- If unsure: write a Decision entry (docs/DECISIONS.md) and propose 2 options.

OUTPUT FORMAT (always)

1. Plan: 3-7 bullets
2. Changes: file list
3. Verify: exact commands + expected signals
4. Completion marker: where it will be written

COMPLETION MARKER
Write `DONE: <story_id>` into docs/PROGRESS.md only after all checks pass.

OVERVIEW POLICY

- docs/OVERVIEW.md is COLD MEMORY.
- It is read ONLY when:
  - a new STORY is created, or
  - Lead explicitly requires architectural clarification.
- Ralph execution loops MUST NOT read OVERVIEW.md.

## Role Loading Rules (critical)

- Only the Lead may read all role files.
- Each teammate must load:
  - AGENTS/GLOBAL.md
  - its own role file in AGENTS/ROLES/
  - docs/STORY.md
  - only the code files it edits.

- Teammates must NOT read other role files.
- If missing information → ask Lead, never scan repo.
