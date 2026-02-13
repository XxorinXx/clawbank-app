# Ralph-style Loop (bounded, deterministic)

Loop purpose: finish ONE story until Done Conditions are satisfied.

STOP CONDITIONS

- All Done Conditions satisfied AND marker written
- Max iterations reached
- Safety stop triggered (repeated failing checks, auth risk, or scope creep)

ITERATION STEPS (always)

1. Read docs/STORY.md + listed Inputs only
2. Implement smallest change set
3. Run scripts/checks.sh (or per-story commands)
4. If fail: patch, commit only when green
5. If green: write DONE marker

MAX ITERATIONS
Default: 12 (raise only by Lead)
