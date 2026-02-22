/**
 * Transaction Size Simulation for Agent Revocation
 *
 * Tests whether the 4 Squads v4 instructions for agent revocation
 * fit within Solana's 1232-byte versioned transaction limit.
 *
 * Instructions tested:
 *   1. configTransactionCreate  — RemoveMember + RemoveSpendingLimit
 *   2. proposalCreate
 *   3. proposalApprove
 *   4. configTransactionExecute (with spendingLimits PDA)
 *
 * Usage:  node scripts/test-revocation-tx-size.mjs
 */

import {
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

// ── Constants ──────────────────────────────────────────────────────
const SOLANA_TX_SIZE_LIMIT = 1232;
const DUMMY_BLOCKHASH = "11111111111111111111111111111111";

// ── Helpers ────────────────────────────────────────────────────────
function buildRevocationInstructions({ sponsor, agentPubkey, createKey, multisigPda, transactionIndex }) {
  const [spendingLimitPda] = multisig.getSpendingLimitPda({
    multisigPda,
    createKey: createKey.publicKey,
  });

  // 1. configTransactionCreate with two actions: RemoveMember + RemoveSpendingLimit
  const configIx = multisig.instructions.configTransactionCreate({
    multisigPda,
    transactionIndex,
    creator: sponsor.publicKey,
    rentPayer: sponsor.publicKey,
    actions: [
      {
        __kind: "RemoveMember",
        oldMember: agentPubkey,
      },
      {
        __kind: "RemoveSpendingLimit",
        spendingLimit: spendingLimitPda,
      },
    ],
  });

  // 2. proposalCreate
  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda,
    transactionIndex,
    creator: sponsor.publicKey,
    rentPayer: sponsor.publicKey,
  });

  // 3. proposalApprove
  const approveIx = multisig.instructions.proposalApprove({
    multisigPda,
    transactionIndex,
    member: sponsor.publicKey,
  });

  // 4. configTransactionExecute (with spendingLimits)
  const executeIx = multisig.instructions.configTransactionExecute({
    multisigPda,
    transactionIndex,
    member: sponsor.publicKey,
    rentPayer: sponsor.publicKey,
    spendingLimits: [spendingLimitPda],
  });

  return { configIx, proposalIx, approveIx, executeIx, spendingLimitPda };
}

function buildVersionedTx(payerKey, instructions) {
  const messageV0 = new TransactionMessage({
    payerKey,
    recentBlockhash: DUMMY_BLOCKHASH,
    instructions,
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}

function analyseTransaction(label, tx) {
  const serialized = tx.serialize();
  const size = serialized.length;
  const fits = size <= SOLANA_TX_SIZE_LIMIT;
  const accountKeys = tx.message.staticAccountKeys.length;

  console.log(`\n── ${label} ──`);
  console.log(`  Transaction size : ${size} / ${SOLANA_TX_SIZE_LIMIT} bytes`);
  console.log(`  Account keys     : ${accountKeys}`);
  console.log(`  Fits in one tx   : ${fits ? "YES ✓" : "NO ✗"}`);
  return { size, fits, accountKeys };
}

// ── Main ───────────────────────────────────────────────────────────
function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Agent Revocation Transaction Size Simulation");
  console.log("═══════════════════════════════════════════════════");

  // Generate dummy keypairs
  const sponsor = Keypair.generate();
  const agentKeypair = Keypair.generate();
  const agentPubkey = agentKeypair.publicKey;
  const createKey = Keypair.generate();
  const multisigCreateKey = Keypair.generate();

  // Derive multisig PDA (deterministic from createKey)
  const [multisigPda] = multisig.getMultisigPda({
    createKey: multisigCreateKey.publicKey,
  });

  const transactionIndex = BigInt(1);

  console.log("\nDerived addresses:");
  console.log(`  Sponsor      : ${sponsor.publicKey.toBase58()}`);
  console.log(`  Agent         : ${agentPubkey.toBase58()}`);
  console.log(`  Multisig PDA  : ${multisigPda.toBase58()}`);

  // ── Test 1: Base revocation (4 Squads instructions) ──
  const { configIx, proposalIx, approveIx, executeIx } =
    buildRevocationInstructions({
      sponsor,
      agentPubkey,
      createKey,
      multisigPda,
      transactionIndex,
    });

  const baseTx = buildVersionedTx(sponsor.publicKey, [
    configIx,
    proposalIx,
    approveIx,
    executeIx,
  ]);

  // Sign with sponsor so we get a realistic serialized size (signature included)
  baseTx.sign([sponsor]);
  const baseResult = analyseTransaction("Base Revocation (4 Squads IXs)", baseTx);

  // ── Test 2: With ComputeBudget instructions ──
  const computeUnitLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: 400_000,
  });
  const computeUnitPriceIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 50_000,
  });

  const budgetTx = buildVersionedTx(sponsor.publicKey, [
    computeUnitLimitIx,
    computeUnitPriceIx,
    configIx,
    proposalIx,
    approveIx,
    executeIx,
  ]);
  budgetTx.sign([sponsor]);
  const budgetResult = analyseTransaction("With ComputeBudget (6 IXs)", budgetTx);

  // ── Per-instruction breakdown ──
  console.log("\n── Per-Instruction Data Size ──");
  const ixLabels = [
    ["configTransactionCreate", configIx],
    ["proposalCreate", proposalIx],
    ["proposalApprove", approveIx],
    ["configTransactionExecute", executeIx],
    ["setComputeUnitLimit", computeUnitLimitIx],
    ["setComputeUnitPrice", computeUnitPriceIx],
  ];
  for (const [name, ix] of ixLabels) {
    console.log(`  ${name.padEnd(28)} : data=${ix.data.length}B  keys=${ix.keys.length}`);
  }

  // ── Summary ──
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Base (4 IXs)         : ${baseResult.size}B — ${baseResult.fits ? "PASS" : "FAIL"}`);
  console.log(`  + ComputeBudget (6)  : ${budgetResult.size}B — ${budgetResult.fits ? "PASS" : "FAIL"}`);
  console.log(`  Headroom (base)      : ${SOLANA_TX_SIZE_LIMIT - baseResult.size}B remaining`);
  console.log(`  Headroom (budget)    : ${SOLANA_TX_SIZE_LIMIT - budgetResult.size}B remaining`);

  if (baseResult.fits && budgetResult.fits) {
    console.log("\n  → All agent revocation instructions fit in a single versioned transaction.");
  } else if (baseResult.fits && !budgetResult.fits) {
    console.log("\n  → Base fits, but ComputeBudget pushes over the limit.");
    console.log("    Consider omitting compute budget or using Jito bundles.");
  } else {
    console.log("\n  → Transaction EXCEEDS the 1232-byte limit.");
    console.log("    Must use Jito bundle or split into multiple transactions.");
  }

  console.log("");

  // Exit with appropriate code
  if (!baseResult.fits) process.exit(1);
}

main();
