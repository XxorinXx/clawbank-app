"use node";

import { PublicKey, TransactionInstruction } from "@solana/web3.js";

/** Default program allowlist — only these programs may be invoked by agents. */
export const DEFAULT_PROGRAM_ALLOWLIST: string[] = [
  "11111111111111111111111111111111", // System Program
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // Token Program
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", // Associated Token Program
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", // Jupiter v6
  "ComputeBudget111111111111111111111111111111", // Compute Budget
];

const VAULT_PDA_PLACEHOLDER = "VAULT_PDA";
const MAX_INSTRUCTIONS = 5;

export interface InstructionJson {
  programId: string;
  keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
  data: string; // base64
}

/**
 * Parse JSON instructions into web3.js TransactionInstruction[].
 * Validates structure, pubkeys, and base64 data.
 */
export function deserializeInstructions(
  jsonInstructions: InstructionJson[],
): TransactionInstruction[] {
  if (jsonInstructions.length === 0) {
    throw new Error("At least one instruction required");
  }
  if (jsonInstructions.length > MAX_INSTRUCTIONS) {
    throw new Error(`Maximum ${MAX_INSTRUCTIONS} instructions allowed`);
  }

  return jsonInstructions.map((ix, i) => {
    if (!ix.programId || !ix.keys || !ix.data) {
      throw new Error(`Instruction ${i}: missing programId, keys, or data`);
    }

    let programId: PublicKey;
    try {
      programId = new PublicKey(ix.programId);
    } catch {
      throw new Error(`Instruction ${i}: invalid programId "${ix.programId}"`);
    }

    const keys = ix.keys.map((key, j) => {
      // Allow VAULT_PDA placeholder — will be replaced later
      let pubkey: PublicKey;
      if (key.pubkey === VAULT_PDA_PLACEHOLDER) {
        pubkey = PublicKey.default; // temporary, replaced by replaceVaultPlaceholder
      } else {
        try {
          pubkey = new PublicKey(key.pubkey);
        } catch {
          throw new Error(
            `Instruction ${i}, key ${j}: invalid pubkey "${key.pubkey}"`,
          );
        }
      }
      return { pubkey, isSigner: key.isSigner, isWritable: key.isWritable };
    });

    let data: Buffer;
    try {
      data = Buffer.from(ix.data, "base64");
    } catch {
      throw new Error(`Instruction ${i}: invalid base64 data`);
    }

    return new TransactionInstruction({ programId, keys, data });
  });
}

/**
 * Replace VAULT_PDA placeholder strings with actual vault PDA address.
 * Operates on the JSON representation before deserialization.
 */
export function replaceVaultPlaceholder(
  jsonInstructions: InstructionJson[],
  vaultPda: PublicKey,
): InstructionJson[] {
  return jsonInstructions.map((ix) => ({
    ...ix,
    keys: ix.keys.map((key) => ({
      ...key,
      pubkey:
        key.pubkey === VAULT_PDA_PLACEHOLDER
          ? vaultPda.toBase58()
          : key.pubkey,
    })),
  }));
}

/**
 * Validate all programs in the instructions are in the allowlist.
 * Throws if any program is not allowed.
 */
export function validateProgramAllowlist(
  instructions: TransactionInstruction[],
  allowlist: string[],
): void {
  for (const ix of instructions) {
    const programId = ix.programId.toBase58();
    if (!allowlist.includes(programId)) {
      throw new Error(`Program ${programId} is not in the allowlist`);
    }
  }
}

/**
 * Estimate SOL outflow from instructions by scanning for SystemProgram transfers
 * where the vault PDA is the sender (fromPubkey).
 */
export function estimateOutflowSol(
  instructions: TransactionInstruction[],
  vaultPda: PublicKey,
): number {
  let totalLamports = 0;
  const SYSTEM_PROGRAM = "11111111111111111111111111111111";
  const LAMPORTS_PER_SOL = 1_000_000_000;

  for (const ix of instructions) {
    if (ix.programId.toBase58() === SYSTEM_PROGRAM && ix.data.length >= 12) {
      // SystemProgram.transfer has instruction type 2, followed by u64 lamports
      const instructionType = ix.data.readUInt32LE(0);
      if (instructionType === 2 && ix.keys.length >= 2) {
        const fromKey = ix.keys[0].pubkey;
        if (fromKey.equals(vaultPda)) {
          const lamports = Number(ix.data.readBigUInt64LE(4));
          totalLamports += lamports;
        }
      }
    }
  }

  return totalLamports / LAMPORTS_PER_SOL;
}
