# Human Control

HUMAN OWNS

- Vision + PRD
- Acceptance criteria
- Final approval / merge
- Max iteration changes

AGENT OWNS

- Implementation, tests, bugfix loops

HUMAN COMMANDS (repo-native)

1. Define / edit docs/PRD.md
2. Define / edit docs/ACCEPTANCE.md
3. Start a story by editing docs/STORY.md (single story only)
4. Run: ./scripts/checks.sh
5. Approve merge only if docs/PROGRESS.md has DONE marker + CI green
