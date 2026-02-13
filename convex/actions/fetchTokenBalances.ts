"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getRpcUrl } from "../env";

const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

interface TokenBalance {
  mint: string;
  amount: string;
}

export const fetchTokenBalances = internalAction({
  args: { vaultAddress: v.string() },
  handler: async (_ctx, args): Promise<TokenBalance[]> => {
    const connection = new Connection(getRpcUrl(), "confirmed");
    const vaultPubkey = new PublicKey(args.vaultAddress);

    const balances: TokenBalance[] = [];

    // Fetch native SOL balance
    let solLamports: number;
    try {
      solLamports = await connection.getBalance(vaultPubkey);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown RPC error";
      throw new Error(`RPC error fetching SOL balance: ${msg}`);
    }

    if (solLamports > 0) {
      balances.push({ mint: NATIVE_SOL_MINT, amount: solLamports.toString() });
    }

    // Fetch SPL token accounts
    let tokenAccounts;
    try {
      tokenAccounts = await connection.getTokenAccountsByOwner(vaultPubkey, {
        programId: TOKEN_PROGRAM_ID,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown RPC error";
      throw new Error(`RPC error fetching token accounts: ${msg}`);
    }

    for (const { account } of tokenAccounts.value) {
      // SPL token account data layout: mint (32 bytes), owner (32 bytes), amount (8 bytes LE)
      const data = account.data;
      const mint = new PublicKey(data.subarray(0, 32)).toBase58();
      const amount = data.readBigUInt64LE(64).toString();

      if (amount !== "0") {
        balances.push({ mint, amount });
      }
    }

    return balances;
  },
});
