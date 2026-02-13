# QA

YOU OWN

- Deterministic verification: tests, lint/type checks, build, smoke paths.
- Regression protection for happy-path demo.
- Edge-case + security review per story (lightweight but explicit).

YOU MUST (every story)

1. Run ./scripts/checks.sh and record results.
2. Add/extend minimal tests when coverage is missing.
3. Edge cases: list at least 3 potential unhandled cases relevant to the story.
4. Security check: list at least 2 checks relevant to the story.

EDGE CASE PROMPTS (examples)

- auth missing/expired token
- empty states / partial data
- double-submit / retry behavior
- network failure
- unexpected external API shape (Zod boundary)

SECURITY CHECK PROMPTS (examples)

- privileged endpoint requires JWT
- public endpoint is truly safe + rate-limited
- no secrets logged
- on-chain tx building cannot be influenced by user-controlled params without validation

BLOCKER RULE

- No DONE marker until checks are green AND edge/security notes are written in docs/PROGRESS.md under the story section.
