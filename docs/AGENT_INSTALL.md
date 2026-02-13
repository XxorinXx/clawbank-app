# ClawBank — Agent Installation Guide

## The Short Version

```bash
npx @clawbank/cli
```

That's it. The CLI walks you through everything.

---

## What Happens When You Run It

The CLI is fully interactive. It asks you one question at a time, in plain English. No config files to write, no environment variables to hunt down.

```
$ npx @clawbank/cli

  Welcome to ClawBank 🐾

  ? Do you have a connect code? (You get this from the ClawBank app)
  > Yes

  ? Paste your connect code:
  > A3F9K2

  ✓ Code verified
  ✓ Wallet created
  ✓ Connected to workspace "My Team Treasury"

  ? Where should we save your config?
  > .env (recommended)

  ✓ Saved to .env

  You're all set! Your agent is connected.

  Run your agent:
    npx openclaw start       # if using OpenClaw
    node my-agent.js         # if using a custom bot
```

Every step shows a clear result (✓ or ✗). If something fails, the CLI tells you exactly what went wrong and what to do about it.

---

## Step-by-Step Breakdown

### 1. Get a Connect Code

A human opens the ClawBank web app, goes to their workspace, and clicks **"Connect Agent"**. The app shows a 6-character code (e.g. `A3F9K2`). They give you this code. It expires in 5 minutes.

### 2. Run the CLI

```bash
npx @clawbank/cli
```

No global install needed. `npx` downloads and runs it directly.

### 3. Paste the Code

The CLI asks for your connect code. Paste it. The CLI does the rest:

1. Verifies the code with the ClawBank backend
2. Creates a secure wallet for your agent (via Turnkey — you never see a private key)
3. Connects the wallet to the workspace's multisig
4. Generates a session token for your agent

### 4. Config is Saved Automatically

The CLI writes two values to your `.env` file:

```
CLAWBANK_API_URL=https://your-deployment.convex.cloud
CLAWBANK_AGENT_TOKEN=eyJhbG...
```

That's everything your agent needs to authenticate.

### 5. Start Your Agent

```bash
# OpenClaw
npx openclaw start

# Custom bot
node my-agent.js
```

---

## How Your Agent Talks to ClawBank

Your agent uses the session token from `.env` to make API calls. It never has access to private keys — all signing happens on the server.

### Using the SDK (recommended)

```bash
npm install @clawbank/sdk
```

```typescript
import { ClawBankAgent } from "@clawbank/sdk";

const agent = new ClawBankAgent();
// Reads CLAWBANK_API_URL and CLAWBANK_AGENT_TOKEN from .env automatically

// Request a spend
const result = await agent.spend({
  token: "SOL",
  amount: 1.5,
  to: "7xK9...mR3q",
});
// result: { success: true, txSignature: "5Ht7..." }
```

### Using the REST API (any language)

```bash
curl -X POST "$CLAWBANK_API_URL/api/agent/spend" \
  -H "Authorization: Bearer $CLAWBANK_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token": "SOL", "amount": 1.5, "to": "7xK9...mR3q"}'
```

---

## Environment Variables

| Variable | Set by CLI? | Description |
|---|---|---|
| `CLAWBANK_API_URL` | Yes | Backend URL |
| `CLAWBANK_AGENT_TOKEN` | Yes | Session token (JWT) — this is your agent's identity |

The CLI writes both of these. You should never need to set them manually.

---

## Session Token Lifecycle

- **Created** when you run `npx @clawbank/cli` and paste a connect code
- **Lasts** 30 days
- **Auto-refreshes** — the SDK handles token refresh automatically before expiry
- **Revoked** instantly if a human disconnects your agent from the web app

If your token expires or is revoked, the CLI will tell you:

```
✗ Session expired. Ask your workspace admin for a new connect code.
```

Then just run `npx @clawbank/cli` again.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Invalid code" | The code expired (5 min) or was already used. Get a new one from the web app. |
| "Session expired" | Token is older than 30 days or was revoked. Run `npx @clawbank/cli` again. |
| "Over budget" | Your spend exceeded the agent's limit. The request becomes a proposal — a human needs to approve it. |
| "Network error" | Check your internet connection. The CLI retries automatically. |
| Can't find `.env` | Run the CLI from your project root. It saves `.env` in the current directory. |

---

## What Runs Where

```
Your Machine                    ClawBank Backend              Turnkey
─────────────                   ────────────────              ───────
Agent runtime                   Convex (DB + API)             Wallet custody
- Stores session token    →     - Auth + policy checks   →    - Signs transactions
- Sends spend intents           - Builds transactions         - Keys never leave
- Never has private keys        - Broadcasts to Solana          secure enclave
```

Your agent is a thin client. It says "I want to send 10 SOL to X" and the backend handles everything else — policy checks, signing, broadcasting, confirmation.

---

## Security Notes

- **No private keys on your machine.** Your agent only holds a session token. Signing happens server-side via Turnkey.
- **Session tokens are workspace-scoped.** A token for Workspace A cannot access Workspace B.
- **Spending limits are enforced server-side.** Even if your agent tries to overspend, the backend blocks it.
- **Humans can disconnect agents instantly** from the web app. This revokes all tokens immediately.
- **All agent actions are logged** and visible to workspace members in the Activity tab.
