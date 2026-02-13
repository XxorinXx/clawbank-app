# UX Spec: Agent Connection Flow

> Deliverable C of Story 0020 — Agent Connection Architecture

---

## 1. Add Agent — Entry Points

### 1a. Agents Tab — Inline Button

When at least one agent exists, a full-width dashed-border button sits below the agent list (identical pattern to "Add Member" in the Humans tab):

- Full-width, `border-dashed border-gray-200`, `rounded-xl`, `py-3`
- Icon: `Bot` (16 px) + label **"Add Agent"**
- Hover: border shifts to `border-gray-300`, text to `text-gray-700`
- Tap: scale 0.98 via `motion.button whileTap`

Clicking opens the **Add Agent modal** (see Section 2).

### 1b. Workspace Header — "Connect Agent" Action

The workspace balance section already lists primary action buttons (Deposit, Send, Connect Agent, Swap). The **"Connect Agent"** button follows the same pill style as its siblings:

- Black background, white text, `rounded-full`, icon `Bot` (14 px) + label **"Connect Agent"**
- Clicking opens the same Add Agent modal

### 1c. Empty-State CTA

When the Agents tab has zero agents (see Section 5), the empty-state card includes an **"Add Agent"** button that also opens the modal.

---

## 2. Add Agent Modal — Step-by-Step

The modal is a centered overlay (`max-w-md`) with a step indicator (dots or "Step X of 3") at the top. Each step has a heading, body content, and a primary action button. The user can close the modal at any time via an X button; doing so cancels the flow and discards any in-progress state.

### Step 1 — Name & Budget

| Element | Detail |
|---------|--------|
| Heading | **"Add Agent"** |
| Subheading | "Name your agent and set its spending budget." |
| Field 1 | Text input — **Agent name** (placeholder: "e.g. My Trading Bot"). Required, max 32 chars. |
| Field 2 | Token selector — dropdown populated from the workspace's current token balances (e.g. SOL, USDC). Displays token icon + symbol. |
| Field 3 | Amount input — numeric, right-aligned, shows token symbol suffix. Placeholder "0.00". |
| Field 4 | Period selector — segmented control with options: **Daily** · **Weekly** · **Monthly**. Default: Daily. |
| Summary line | Below inputs: *"This agent can spend up to **50 SOL per day** without approval."* (dynamic) |
| Primary button | **"Next"** — enabled when name is filled, token is selected, and amount > 0. |
| Back | (none — first step) |

Validation:

- Name must be non-empty and unique within the workspace (checked on "Next" press).
- If duplicate: inline error below the name field — *"An agent with this name already exists."*

### Step 2 — Connect Code

This step generates a short-lived code the agent runtime uses to authenticate.

| Element | Detail |
|---------|--------|
| Heading | **"Connect Your Agent"** |
| Subheading | "Run this in your agent's terminal — that's it." |
| CLI instruction | Monospace block: `npx clawbank connect <CODE>` — one-click copyable. Large, prominent, impossible to miss. |
| Code display | The 6-character alphanumeric code is embedded in the CLI command above but also shown standalone in **large monospace font** (`text-3xl font-mono tracking-widest`), centered, with a light background pill (`bg-gray-50 rounded-xl px-6 py-4`). |
| Timer | Below the code: *"Expires in X:XX"* — countdown from 5:00 (five minutes). Text turns `text-red-500` when under 1:00. |
| Copy button | Inline button next to/below code — icon `Copy` (16 px) + **"Copy"**. On click, copies the full CLI command and shows brief "Copied!" toast. |
| Waiting indicator | Pulsing dot + *"Waiting for agent to connect..."* — appears below the instruction. |
| Auto-advance | When the backend detects a successful agent handshake, the modal automatically advances to Step 3. No user action required. |
| Code expiry | If the timer reaches 0:00 before connection, the code area is replaced with: *"Code expired."* and a **"Get New Code"** button that resets the timer and issues a fresh code. |

### Step 3 — Done

| Element | Detail |
|---------|--------|
| Icon | Green checkmark circle (animated fade-in). |
| Heading | **"Agent Connected"** |
| Detail line 1 | Agent name (bold) — e.g. **My Trading Bot** |
| Detail line 2 | Wallet address (truncated) — e.g. `7xK9...mR3q` |
| Detail line 3 | Budget summary — e.g. *"50 SOL / day"* |
| Primary button | **"Done"** — closes modal and refreshes the Agents tab to show the new entry. |

---

## 3. Post-Connection — What the User Sees

### 3a. Agents Tab — Agent Row

Each connected agent appears as a row in the Agents tab list. Row layout:

| Column | Content |
|--------|---------|
| Icon | Bot avatar (colored circle with `Bot` icon, color derived from agent name hash) |
| Name | Agent name (bold) |
| Status | Badge — **"Active"** (`bg-green-50 text-green-700`) or **"Disconnected"** (`bg-gray-100 text-gray-500`) |
| Budget | e.g. "50 SOL/day" — token icon + amount + period |
| Last Activity | Relative timestamp — "Just now", "2 min ago", "3 hours ago", etc. |

### 3b. Agent Row Actions

Tapping an agent row expands it or shows an action sheet with:

| Action | Behavior |
|--------|----------|
| **Manage** | Opens agent settings panel/modal — allows editing name or budget. |
| **Disconnect** | Destructive action. Shows confirmation dialog: *"Disconnect [Agent Name]? This agent will lose access to the workspace. You can reconnect later."* Two buttons: **"Cancel"** (secondary) and **"Disconnect"** (red/destructive). On confirm: agent is removed from Squads membership, session revoked, row updates to "Disconnected" status or is removed from the list. |

---

## 4. Error Messages

| Scenario | Message | Action |
|----------|---------|--------|
| Connect code expired | *"Code expired."* | **"Get New Code"** button (resets timer, issues new code) |
| Duplicate agent name | *"An agent with this name already exists."* | Inline error on name field; user must change name |
| Connection failed | *"Failed to connect. Please try again."* | **"Retry"** button (re-attempts handshake without regenerating code, if still valid) |
| Wallet creation failed | *"Could not create agent wallet. Please try again later."* | **"Retry"** button; if persistent, *"Contact support."* |
| Network error (general) | *"Something went wrong. Check your connection and try again."* | **"Retry"** button |

All error messages appear inline within the modal step where the error occurs. They do not use disruptive alert dialogs.

---

## 5. Empty States

### 5a. Agents Tab — No Agents Connected

Centered vertical layout (matches `TabPlaceholder` pattern):

| Element | Detail |
|---------|--------|
| Icon | `Bot` icon (28 px) inside a `h-16 w-16 rounded-2xl bg-gray-100` container, color `text-gray-400` |
| Heading | **"No agents connected"** (`text-sm font-medium text-gray-400`) |
| Subtext | *"Connect your first agent to automate transactions"* (`text-xs text-gray-300`) |
| CTA | **"Add Agent"** button (primary style, `bg-gray-900 text-white rounded-full px-4 py-2 text-sm`) — opens the Add Agent modal |

### 5b. Budget Not Set (edge case)

If a user skips or removes a budget after connection:

- Budget column shows *"No budget set"* in `text-gray-400`
- Manage action highlights budget configuration as recommended

---

## 6. Accessibility Notes

- All modal steps are keyboard-navigable; focus is trapped within the modal while open.
- The connect code is selectable and announced by screen readers as individual characters.
- The countdown timer updates the `aria-live` region so screen readers announce time remaining.
- Destructive actions (Disconnect) require explicit confirmation and are not triggered by single click/tap alone.
- Color is never the sole indicator of state — status badges include text labels, the timer includes numeric text alongside color change.
