# ClawBank — Agent Installation Guide

## The Short Version

```bash
node scripts/agent-connect.mjs YOUR_CODE
```

That's it. The script connects your agent and saves everything to `.env`.

---

## What Happens When You Run It

The script is a single command. Give it your connect code and it handles the rest.

```
$ node scripts/agent-connect.mjs A3F9K2

  ClawBank Agent Connect

  ✓ Code verified
  ✓ Connected to workspace
  ✓ Saved to .env

  You're all set! Your agent is connected.

  Run your agent:
    npx openclaw start       # if using OpenClaw
    node my-agent.js         # if using a custom bot
```

If you don't pass a code as an argument, the script prompts you:

```
$ node scripts/agent-connect.mjs

  ClawBank Agent Connect

  ? Paste your connect code: A3F9K2

  ✓ Code verified
  ...
```

Every step shows a clear result (✓ or ✗). If something fails, it tells you exactly what went wrong.

---

## Step-by-Step Breakdown

### 1. Get a Connect Code

A human opens the ClawBank web app, goes to their workspace, and clicks **"Connect Agent"**. The app shows a 6-character code (e.g. `A3F9K2`). They give you this code. It expires in 5 minutes.

### 2. Run the Connect Script

From the ClawBank repo root:

```bash
node scripts/agent-connect.mjs A3F9K2
```

Or interactively:

```bash
node scripts/agent-connect.mjs
```

The script:

1. Verifies the code with the ClawBank backend
2. Receives a session token for your agent
3. Writes credentials to `.env`

### 3. Config is Saved Automatically

The script writes two values to your `.env` file:

```
CLAWBANK_API_URL=https://your-deployment.convex.cloud
CLAWBANK_AGENT_TOKEN=eyJhbG...
```

That's everything your agent needs to authenticate.

### 4. Start Your Agent

```bash
# OpenClaw
npx openclaw start

# Custom bot
node my-agent.js
```

---

## How Your Agent Talks to ClawBank

Your agent uses the session token from `.env` to make API calls. It never has access to private keys — all signing happens on the server.

### Using the SDK (future)

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

| Variable | Set by script? | Description |
|---|---|---|
| `CLAWBANK_API_URL` | Yes | Backend URL (Convex deployment) |
| `CLAWBANK_AGENT_TOKEN` | Yes | Session token — this is your agent's identity |

The connect script writes both of these. You should never need to set them manually.

---

## Session Token Lifecycle

- **Created** when you run the connect script and paste a connect code
- **Lasts** 24 hours
- **Revoked** instantly if a human disconnects your agent from the web app

If your token expires or is revoked:

```
✗ Session expired. Ask your workspace admin for a new connect code.
```

Then just run `node scripts/agent-connect.mjs` again with a new code.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Invalid code" | The code expired (5 min) or was already used. Get a new one from the web app. |
| "Session expired" | Token expired (24h) or was revoked. Run the connect script again. |
| "Over budget" | Your spend exceeded the agent's limit. The request becomes a proposal — a human needs to approve it. |
| "Network error" | Check your internet connection. The script retries once automatically. |
| Can't find `.env` | Run the script from your project root. It saves `.env` in the current directory. |

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
