# Safety Guardrails

AUTONOMY BOUNDS

- No broad refactors. No dependency upgrades unless story explicitly requires.
- No secret handling in chat. No private keys. No token pastes.
- ClawBank uses MAINNET ONLY (Solana mainnet-beta). No devnet/testnet. All on-chain operations target mainnet.

RISKY FEATURES POLICY

- If implementation touches money movement / signing / auth:
  1. stub behind a feature flag OR
  2. implement minimal safe path only
- Prefer "happy-path demo works" over completeness.

OBSERVABILITY

- Every change must be backed by a deterministic signal:
  - tests, lint/type checks, build, or logged smoke flow.
- QA blocks completion if signals are missing.

PUBLIC ENDPOINTS

- Only allowed for explicitly labeled "agent communication" endpoints.
- Must be minimal + rate-limited + audited in Activity log.

# Claude Safety Rules (Project Jail)

You may ONLY operate inside this repository directory.

Hard rules:

- Never run commands that reference absolute paths like /Users, /etc, /Applications, /Volumes.
- Never use: sudo, rm -rf, chmod -R, chown -R, launchctl, brew, defaults, diskutil.
- Only run commands that are strictly scoped to the repo, e.g.:
  - git status, git diff, git commit (NO push unless asked)
  - npm/pnpm/yarn commands ONLY when cwd is repo root
  - node scripts inside this repo
- If a command might affect anything outside the repo, STOP and ask.
- Never read from ~/.ssh, ~/.config, ~/.env, Keychain, or any parent directory.
- Never print secrets or keys into logs or commits.
