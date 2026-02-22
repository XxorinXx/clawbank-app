# Folder Rules Policy

- The required folder trees are the default contract.
- Extensions are allowed only under defined buckets.
- Any new folder must have a 1-3 line justification in docs/DECISIONS.md.
- No reorganizations unless the active story requires it.

# Code Conventions (strict)

GENERAL

- TypeScript strict. No `any` unless justified with a comment.
- Validate boundary inputs with Zod (env, external API responses, request payloads).
- Prefer pure functions, explicit return types on exported functions.

FRONTEND

- Zustand for local/global state.
- TanStack Query for server state. No ad-hoc fetch caching.
- TanStack Router for routing.
- Motion for animations.
- Tailwind for styling. Keep class lists readable (extract when too long).
- Radix primitives OK; shadcn patterns OK but components live in our codebase.
- "~" alias only.

BACKEND (Convex)

- Follow required convex/ hierarchy exactly.
- Shared types go in convex/types and src can import to avoid duplication.
- Shared utils go in convex/utils where appropriate (non-React).
- All protected calls require Privy JWT; only explicit public endpoints bypass.
- Sponsor keypair (`SPONSOR_PRIVATE_KEY`) must only be used for `payerKey` and `rentPayer` — never as `creator` or `member` in Squads instructions.
- All multisig operations use the build-then-user-signs pattern: backend builds tx with user wallet as creator/member, sponsor as fee payer, partial-signs with sponsor, frontend user signs with Privy wallet.
- DB writes for governance operations happen only after on-chain confirmation.
- After finishing backend changes, always run `npx convex dev` to validate — it surfaces Convex type errors that `tsc --noEmit` misses.
