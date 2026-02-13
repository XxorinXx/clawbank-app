# Cost Control

DEFAULT LOOP LIMITS

- 12 iterations per story (Lead may raise to 20 max for bugfix-only)

MICRO-STORY SIZE

- 1-3 files ideally, <= 200 LOC net change target
- If more: split story

MODEL TIERS (policy)

- PM/UX: smaller model for writing acceptance + copy
- FE/BE: mid model for implementation
- Lead/QA escalation: strongest model only for hard bugs / gnarly integration

CONTEXT POLICY

- Each run reads only Inputs listed in docs/STORY.md
- Write memory to docs/DECISIONS.md and docs/PROGRESS.md
