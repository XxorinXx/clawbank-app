# Progress

DONE: 001A
DONE: 001B

## 001C QA Notes

### Checks (scripts/checks.sh)

All 4 checks pass:
- **Lint**: PASS (fixed `prefer-const` in `convex/queries/listUserWorkspaces.ts`)
- **Typecheck**: PASS (fixed circular type inference in `convex/actions/createWorkspace.ts` by adding explicit return type; added return type annotations in `convex/internals/workspaceHelpers.ts`)
- **Build**: PASS
- **Tests**: PASS (no tests yet)

### Edge Cases (3)

1. **Empty workspace name**: VALIDATED — `createWorkspace.ts` lines 30-33 trims input and throws `"Workspace name cannot be empty"` if empty.
2. **Invalid wallet address**: VALIDATED — `createWorkspace.ts` lines 51-57 wraps `new PublicKey(wm.value)` in try/catch and throws `"Invalid wallet address: ..."`.
3. **Duplicate members**: NOT explicitly handled — no dedup check in backend action. If the same wallet address is added twice, it will be passed to the Squads multisig creation and stored twice in `workspace_members`. This is a minor gap; consider adding dedup logic in a future story.

### Security Checks (2)

1. **Auth required on create-workspace**: VERIFIED — `createWorkspace.ts` lines 24-27 calls `ctx.auth.getUserIdentity()` and throws `"Unauthenticated"` if null. The `listUserWorkspaces` query (line 15-18) also checks auth.
2. **Sponsor key never logged/exposed**: VERIFIED — Grepped all `convex/` source files for `console.log`, `console.warn`, `console.error` — none found in application code (only in `convex/README.md` example). Sponsor key is accessed only via `process.env.SPONSOR_PRIVATE_KEY`, never returned in responses, and has explicit code comment: `"NEVER log or return this value"`.

### Additional Notes

- Rate limiting is implemented: 30-second cooldown between workspace creations per user (`RATE_LIMIT_MS = 30_000`).
- Workspace creation uses a server-side sponsor keypair to pay Solana fees, keeping the user's wallet out of the signing flow.
- Email-type members are stored as pending invites (not added to on-chain multisig), which is correct per story requirements.

DONE: 001C
