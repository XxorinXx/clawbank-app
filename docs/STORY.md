# STORY: 001F Drawer Tabs + Members Tab

## Team Deployment

Deploy Claude Code Agent Team (delegate mode ON):

- Lead
- PM/UX
- Frontend
- Backend
- QA

Use shared task list.
Execute only this story until DONE.

## Skills enabled

Backend:

- https://skills.sh/solana-foundation/solana-dev-skill/solana-dev
- https://skills.sh/sendaifun/skills/squads

Frontend:

- https://skills.sh/nextlevelbuilder/ui-ux-pro-max-skill/ui-ux-pro-max
- https://skills.sh/jezweb/claude-skills/tailwind-v4-shadcn
- https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices

PM/UX:

- https://skills.sh/nextlevelbuilder/ui-ux-pro-max-skill/ui-ux-pro-max

## Inputs (only allowed files)

- docs/OVERVIEW.md
- docs/PRD.md
- docs/ACCEPTANCE.md
- AGENTS/\*
- scripts/checks.sh
- existing workspace + auth + balance hooks

## Scope (must)

### Gate 0 — Flow agreement (must be done first, inside this story)

PM/UX + Backend must write a short decision in docs/DECISIONS.md:

- “Member removal flow v1”
- includes:
  - what happens on delete (proposal creation vs direct)
  - what data is required
  - what UI states exist (idle, confirming, submitting, pending, success, error)

Frontend must not implement destructive on-chain changes until this decision exists.

### A) Reusable drawer tab navigation component (Frontend)

Build a reusable Tabs component for drawer layout:

- Plain text tabs, clickable
- Active tab: black text
- Inactive: grey text
- Scalable: supports arbitrary number of tabs, icons optional, keyboard accessible
- API must support:
  - items: { key, label, icon? }
  - activeKey
  - onChange(key)
  - optional rightSlot/headerSlot
- Tab content renders below tabs (children or render function)
- No hardcoded tabs inside component (must be reusable)

### B) Tabs placeholders (Frontend)

Create placeholder tabs for the sections from docs/OVERVIEW.md:

- Each tab shows placeholder content (icon + short label underneath)
- No extra logic beyond placeholders

### C) Members tab (Frontend + Backend)

Members tab must be fully implemented.

UI:

- List rows, each row shows:
  - user icon inside grey container (avatar placeholder ok)
  - name to the right
  - under name: roles list (approve/vote/execute etc). If multiple, show multiple.
  - far right:
    - Delete icon button (destructive)
    - Manage button (text inside container)
- If member is the only one:
  - Manage is disabled (greyed, not clickable)
  - Delete button is not rendered
- Add Member button somewhere in the tab (stub, no action)

Data strategy (deterministic):

1. Render immediately from DB members list.
2. Fetch on-chain members in parallel.
3. When on-chain returns:
   - merge/overlay roles + membership (prefer on-chain truth)
   - if DB is stale, update DB (backend responsibility)
   - re-render with updated dataset
4. Must avoid flicker: preserve stable ordering and show subtle “syncing” state.

Backend responsibilities:

- Provide query: getWorkspaceMembers(workspaceId) -> DB members
- Provide action/query: fetchWorkspaceMembersOnchain(workspaceId) -> on-chain members
- Provide mutation: reconcileMembersFromOnchain(workspaceId, onchainMembers) -> updates DB if needed

### D) Delete member (UI + proposal stub)

- Delete button opens confirmation modal:
  - title + short explanation
  - Cancel + Confirm buttons
- On confirm:
  - Execute the “member removal flow v1” from docs/DECISIONS.md
  - If flow is proposal-based:
    - create proposal (or stub if backend says not ready)
  - UI must show pending state and success/error deterministically

Hard rule:

- No silent failures. Show explicit error UI.

## Out of scope (must not)

- Add member functionality (button is stub)
- Spending limits UI
- Agents tab functionality
- Full approval/voting UI beyond placeholder

## QA requirements

- Run ./scripts/checks.sh
- Edge cases ≥ 5:
  - 0 members (should not happen, handle anyway)
  - 1 member (disable manage, hide delete)
  - DB vs on-chain mismatch (reconcile)
  - on-chain fetch fails (fallback to DB + warning)
  - delete confirm cancel + confirm flows
- Security checks ≥ 3:
  - auth gating for member queries/actions
  - destructive action requires confirmation
  - no secrets/logging of keys

## Done Conditions

- Gate 0 decision written in docs/DECISIONS.md
- Tabs component reusable and used in drawer
- Placeholder tabs rendered
- Members tab implemented with DB-first then on-chain overlay + reconcile
- Delete modal implemented; delete triggers flow per decision (proposal or stub)
- lint/typecheck/build/tests pass
- QA notes written
- DONE: 001F written to docs/PROGRESS.md
