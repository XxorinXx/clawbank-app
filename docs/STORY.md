# CB-TX-001: Agent Arbitrary Transaction Execution

## Summary

Allow AI agents to build and submit **arbitrary Solana transactions** (swaps, DeFi interactions, multi-instruction bundles) through the ClawBank backend. The backend validates spending limits, wraps the agent's instructions into a Smart Account vault transaction, and either auto-executes (under limit) or creates a proposal (over limit) — identical to the existing transfer flow but for any instruction set.

## Motivation

Currently agents can only do simple SOL transfers via `POST /agent/transfer`. Real-world AI agents need to:
- Swap tokens on Jupiter/Raydium
- Interact with lending protocols (Marinade, Kamino)
- Execute multi-step DeFi strategies
- Send SPL tokens (not just SOL)

This unlocks the full power of the Smart Account: agents build whatever instructions they want, but the vault's spending limits and human approval gates still apply.

## Architecture

### New Endpoint: `POST /agent/execute`

The agent sends **serialized instructions** (not a full transaction). The backend:
1. Deserializes and validates each instruction
2. Estimates the total SOL value leaving the vault (outflows)
3. Checks spending limit against the estimated outflow
4. **Under limit** → wraps instructions in a Smart Account vault transaction, creates proposal, auto-approves + executes (since agent has Initiate permission and threshold=1)
5. **Over limit** → wraps instructions in a `createTransaction` + `createProposal`, signs, submits. Human approves from UI.

### Instruction Format

Agents send instructions as JSON-serializable objects:

```json
{
  "instructions": [
    {
      "programId": "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
      "keys": [
        { "pubkey": "...", "isSigner": false, "isWritable": true },
        { "pubkey": "VAULT_PDA", "isSigner": false, "isWritable": true }
      ],
      "data": "base64-encoded-instruction-data"
    }
  ],
  "shortNote": "Jupiter swap SOL→USDC",
  "description": "Swap 0.5 SOL for USDC via Jupiter aggregator",
  "estimatedValueSol": 0.5
}
```

- `VAULT_PDA` is a placeholder string. The backend replaces it with the actual vault PDA.
- `estimatedValueSol` is the agent's declared outflow. The backend validates this against the actual instruction accounts.
- Instructions are executed **from the vault** (the Smart Account's vault PDA is the signer for CPI).

### Spending Limit Enforcement

For arbitrary transactions, spending limits work differently than simple transfers:

1. **Agent provides `estimatedValueSol`** — the declared total value leaving the vault
2. **Backend validates the estimate** — scans instruction accounts for vault debit patterns (SOL transfers, token transfers from vault ATAs)
3. **Spending limit check** — uses the validated amount against `checkSpendingLimit()`
4. **Under limit** → creates vault transaction + proposal, auto-approves + executes in single flow
5. **Over limit** → creates vault transaction + proposal, waits for human approval

### Security Constraints

- **Program allowlist** (Phase 1: configurable per-workspace, Phase 2: on-chain policy) — only whitelisted programs can be called
- **No arbitrary signers** — the vault PDA is the only signer for CPI instructions. Agent cannot sign as themselves within the transaction.
- **SOL balance check** — backend verifies vault has sufficient SOL before submitting
- **Instruction size limit** — max 5 instructions per request, max 1232 bytes total (Solana tx limit)
- **Rate limiting** — same as transfer endpoint

---

## Inputs (files agents should read)

- `AGENTS/CONVENTIONS.md`
- `docs/FULL_DOCUMENTATION.md` — Sections 5 (On-Chain), 6 (Build-then-Sign), 7 (Actions), 11 (HTTP API)
- `convex/actions/agentTransfer.ts` — Existing transfer action (pattern to follow)
- `convex/actions/transferApproval.ts` — Existing approval flow
- `convex/lib/txBuilders.ts` — Transaction builder patterns
- `convex/lib/spendingLimitPolicy.ts` — Spending limit logic
- `convex/http.ts` — HTTP endpoint registration
- `clawbank-sdk/src/client.ts` — SDK client class
- `clawbank-sdk/src/types.ts` — SDK type definitions
- `docs/API_SURFACE.md` — Existing endpoint specs

---

## Stories

### TX-001A: Backend — `agentExecute` action + instruction validator

**Team:** backend-core (worktree)

**Changes:**
- `convex/lib/instructionValidator.ts` — New module:
  - `deserializeInstructions(json[])` → `TransactionInstruction[]` — Parse instruction JSON into web3.js objects
  - `replaceVaultPlaceholder(instructions, vaultPda)` → instructions with `VAULT_PDA` string replaced with actual vault PDA
  - `validateProgramAllowlist(instructions, allowlist)` → throws if any instruction targets a disallowed program
  - `estimateOutflowSol(instructions, vaultPda)` → estimated SOL value leaving the vault (scan for SystemProgram transfers, token transfers from vault)
  - `PROGRAM_ALLOWLIST` — default set of allowed program IDs
- `convex/actions/agentExecute.ts` — New action:
  - Auth: reuse session validation pattern from `agentTransfer.ts`
  - Validate: deserialize instructions, replace VAULT_PDA, check allowlist, validate estimate
  - Load agent, workspace, spending limit
  - Check spending limit against `estimatedValueSol`
  - Under limit: build `createTransaction` + `createProposal` + `approveProposal` + `executeTransaction` — all in one flow (agent initiates, sponsor approves+executes since threshold=1)
  - Over limit: build `createTransaction` + `createProposal` only — human approves later
  - Store in `transfer_requests` with `metadata.type = "execute"` and serialized instructions
  - Log activity with instruction summary
- `convex/http.ts` — Add `POST /agent/execute` route
- `docs/API_SURFACE.md` — Add endpoint spec

**Acceptance Criteria:**
- Agent can submit arbitrary instructions via HTTP
- Instructions with disallowed programs are rejected with 400
- Under-limit instructions are executed on-chain immediately
- Over-limit instructions create a proposal
- `VAULT_PDA` placeholder is correctly replaced
- Activity log captures the execution

**Verify:** `bash scripts/checks.sh`

---

### TX-001B: SDK — `client.execute()` method + types

**Team:** sdk-engineer (worktree)

**Changes:**
- `clawbank-sdk/src/types.ts` — New types:
  ```typescript
  interface InstructionInput {
    programId: string;          // base58 program ID
    keys: AccountMetaInput[];   // account metas
    data: string;               // base64-encoded instruction data
  }
  interface AccountMetaInput {
    pubkey: string;             // base58 or "VAULT_PDA" placeholder
    isSigner: boolean;
    isWritable: boolean;
  }
  interface ExecuteParams {
    instructions: InstructionInput[];
    note: string;               // 1-80 chars
    description?: string;
    estimatedValueSol: number;  // agent's declared outflow
  }
  interface ExecuteResult {
    requestId: string;
    status: "executed" | "pending_approval" | "failed";
    txSignature?: string;
    proposalAddress?: string;
  }
  ```
- `clawbank-sdk/src/client.ts` — Add `execute(params: ExecuteParams): Promise<ExecuteResult>` method
- `clawbank-sdk/src/api/endpoints.ts` — Add `execute: { method: "POST", path: "/agent/execute" }`
- `clawbank-sdk/src/index.ts` — Export new types

**Acceptance Criteria:**
- `client.execute()` sends instructions to backend
- Types are exported
- SDK builds cleanly

**Verify:** `cd clawbank-sdk && npm run typecheck && npm run build`

---

### TX-001C: SDK — Instruction builder helpers

**Team:** sdk-engineer (worktree, after TX-001B)

**Changes:**
- `clawbank-sdk/src/instructions.ts` — New module:
  ```typescript
  const VAULT_PDA = "VAULT_PDA";

  // Build a SOL transfer instruction (vault → recipient)
  function buildSolTransfer(params: {
    recipient: string;
    amountLamports: number;
  }): InstructionInput

  // Build an SPL token transfer instruction (vault ATA → recipient ATA)
  function buildTokenTransfer(params: {
    mint: string;
    recipient: string;
    amount: number;
    decimals: number;
  }): InstructionInput[]

  // Parse a Jupiter swap API response into instructions
  function parseJupiterSwapInstructions(
    swapTransaction: string  // base64 VersionedTransaction from Jupiter API
  ): InstructionInput[]
  ```
- `clawbank-sdk/src/index.ts` — Export helpers + `VAULT_PDA` constant
- Unit tests in `clawbank-sdk/tests/instructions.test.ts`

**Acceptance Criteria:**
- SOL transfer helper produces correct System Program instruction
- Token transfer helper produces correct Token Program + ATA instructions
- Jupiter parser extracts instructions from a base64 transaction
- Unit tests pass

**Verify:** `cd clawbank-sdk && npm test && npm run build`

---

### TX-001D: Backend — Program allowlist configuration

**Team:** backend-config (worktree)

**Changes:**
- `convex/schema.ts` — Add optional `programAllowlist` field to `workspaces` table:
  ```typescript
  programAllowlist: v.optional(v.array(v.string()))
  ```
- `convex/mutations/workspaces.ts` — New file or add to existing:
  - `updateProgramAllowlist(workspaceId, programs[])` — Set custom allowlist
- `convex/queries/workspaces.ts` — Expose allowlist in workspace data if needed
- `convex/lib/instructionValidator.ts` — `validateProgramAllowlist()` checks workspace-specific list first, falls back to global default
- Default allowlist constant (5 programs):
  - `11111111111111111111111111111111` — System Program
  - `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` — Token Program
  - `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL` — Associated Token Program
  - `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` — Jupiter v6
  - `ComputeBudget111111111111111111111111111111` — Compute Budget

**Acceptance Criteria:**
- Workspace schema supports optional allowlist
- Default allowlist covers common DeFi
- Custom allowlist overrides default when set
- Unknown programs are rejected

**Verify:** `bash scripts/checks.sh`

---

### TX-001E: Frontend — Execute request display

**Team:** frontend (worktree)

**Changes:**
- `src/components/RequestsTab.tsx` — Handle `metadata.type === "execute"` requests:
  - Show instruction count badge (e.g., "3 instructions")
  - Show program names for known programs
  - Show estimated SOL value
- `src/components/RequestDetailModal.tsx` — Expand for execute requests:
  - List each instruction: program name, account count, data size (bytes)
  - "Programs used" summary chips
  - Approve/deny buttons unchanged (same proposal mechanism)
- `src/utils/programs.ts` — New utility: map known program IDs to human-readable names

**Acceptance Criteria:**
- Execute requests render distinctly from simple transfers
- Instruction details visible in detail modal
- Approve/deny works identically to transfer proposals
- Unknown programs show truncated address

**Verify:** `bash scripts/checks.sh`

---

### TX-001F: Tests — Unit + e2e

**Team:** test-engineer (worktree)

**Changes:**
- `convex/lib/__tests__/instructionValidator.test.ts` — Unit tests:
  - Deserialize valid instructions
  - Reject malformed instructions (bad base64, missing fields)
  - VAULT_PDA replacement in keys
  - Program allowlist: pass for allowed, reject for disallowed
  - Outflow estimation for SOL transfers
- `convex/lib/__tests__/agentExecuteAtomicity.test.ts` — Atomicity tests:
  - DB writes only after on-chain confirmation
  - No DB writes when send/confirm fails
- `e2e/agent-execute.spec.ts` — E2e:
  - Full execute flow with under-limit and over-limit
- `clawbank-sdk/tests/instructions.test.ts` — SDK helper tests

**Acceptance Criteria:**
- All unit tests pass
- Atomicity invariant verified
- E2E demonstrates full flow

**Verify:** `npm test && npx playwright test`

---

## Team Deployment Plan

```
┌──────────────────────────────────────────────────────┐
│                    PARALLEL PHASE                      │
│                                                        │
│  backend-core ──── TX-001A (action + validator)        │
│  sdk-engineer ──── TX-001B (execute method + types)    │
│  backend-config ── TX-001D (allowlist schema)          │
│                                                        │
├──────────────────────────────────────────────────────┤
│                   SEQUENTIAL PHASE                     │
│                                                        │
│  sdk-engineer ──── TX-001C (instruction helpers)       │
│  frontend ──────── TX-001E (UI for execute requests)   │
│                                                        │
├──────────────────────────────────────────────────────┤
│                    FINAL PHASE                         │
│                                                        │
│  test-engineer ─── TX-001F (all tests)                 │
│                                                        │
└──────────────────────────────────────────────────────┘
```

5 agents total. 3 run in parallel, then 2 sequential, then 1 for tests.

---

## API Spec: `POST /agent/execute`

**Headers:**
```
Authorization: DPoP <access-token>
X-DPoP: <dpop-proof-jwt>
```

**Request:**
```json
{
  "instructions": [
    {
      "programId": "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
      "keys": [
        { "pubkey": "VAULT_PDA", "isSigner": true, "isWritable": true },
        { "pubkey": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "isSigner": false, "isWritable": true }
      ],
      "data": "base64-encoded-data"
    }
  ],
  "shortNote": "Jupiter swap SOL to USDC",
  "description": "Swap 0.5 SOL for ~75 USDC via Jupiter aggregator route",
  "estimatedValueSol": 0.5
}
```

**Response (executed — under limit):**
```json
{
  "requestId": "convex-id",
  "status": "executed",
  "txSignature": "base58-signature"
}
```

**Response (pending — over limit):**
```json
{
  "requestId": "convex-id",
  "status": "pending_approval",
  "proposalAddress": "base58-proposal-pda"
}
```

**Errors:**
| Code | Condition |
|------|-----------|
| `400` | Invalid instructions, disallowed program, bad estimate, missing fields, too many instructions |
| `401` | Invalid/expired auth token or DPoP proof |
| `403` | Agent not active |
| `429` | Rate limited |

---

## Open Questions

1. **Ephemeral signers** — Some DeFi protocols require ephemeral signers for CPI. The Smart Account supports `ephemeralSigners` param in `createTransaction`. Do we expose this to agents or handle it transparently?

2. **Address Lookup Tables (ALTs)** — Complex Jupiter routes use ALTs to fit within the 1232-byte limit. Should the backend support ALT references in the execute request, or does the Smart Account `createTransaction` handle this?

3. **Simulation before submission** — Should the backend simulate the vault transaction before submitting? Recommended: simulate for under-limit (auto-execute), skip for proposals (human reviews anyway).

4. **SPL token spending limits** — Current spending limits are SOL-only. For token swaps, should we estimate the SOL-equivalent value? Phase 1: use `estimatedValueSol` from the agent. Phase 2: per-token on-chain limits.
