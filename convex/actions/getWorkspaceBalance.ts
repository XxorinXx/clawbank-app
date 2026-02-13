"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import * as multisig from "@sqds/multisig";
import { PublicKey } from "@solana/web3.js";

interface TokenBalanceInfo {
  mint: string;
  symbol: string;
  name: string;
  icon: string | null;
  amount: string;
  usdValue: number;
}

interface WorkspaceBalance {
  totalUsd: number;
  tokens: TokenBalanceInfo[];
}

export const getWorkspaceBalance = action({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args): Promise<WorkspaceBalance> => {
    // Auth check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    // Look up workspace
    const workspace = await ctx.runQuery(
      internal.internals.workspaceHelpers.getWorkspaceById,
      { workspaceId: args.workspaceId },
    );
    if (!workspace) {
      throw new Error("Workspace not found");
    }

    // Derive vault PDA from multisig address
    const multisigPda = new PublicKey(workspace.multisigAddress);
    const [vaultPda] = multisig.getVaultPda({
      multisigPda,
      index: 0,
    });

    // Fetch token balances from RPC
    const balances = await ctx.runAction(
      internal.actions.fetchTokenBalances.fetchTokenBalances,
      { vaultAddress: vaultPda.toBase58() },
    );

    if (balances.length === 0) {
      return { totalUsd: 0, tokens: [] };
    }

    // Collect all mints
    const mints = balances.map((b: { mint: string }) => b.mint);

    // Fetch metadata and prices in parallel via internal actions
    const [metadata, prices] = await Promise.all([
      ctx.runAction(
        internal.actions.fetchTokenMetadata.fetchTokenMetadata,
        { mints },
      ),
      ctx.runAction(
        internal.actions.fetchTokenPrices.fetchTokenPrices,
        { mints },
      ),
    ]);

    // Build metadata and price maps
    const metaMap = new Map<string, { symbol: string; name: string; icon?: string; decimals: number }>();
    for (const m of metadata) {
      metaMap.set(m.mint, m);
    }

    const priceMap = new Map<string, number>();
    for (const p of prices) {
      priceMap.set(p.mint, p.priceUsd);
    }

    // Compute per-token USD values
    let totalUsd = 0;
    const tokens: TokenBalanceInfo[] = [];

    for (const balance of balances) {
      const meta = metaMap.get(balance.mint);
      const price = priceMap.get(balance.mint) ?? 0;
      const decimals = meta?.decimals ?? 0;

      const humanAmount = Number(BigInt(balance.amount)) / Math.pow(10, decimals);
      const usdValue = humanAmount * price;
      totalUsd += usdValue;

      tokens.push({
        mint: balance.mint,
        symbol: meta?.symbol ?? "UNKNOWN",
        name: meta?.name ?? "Unknown Token",
        icon: meta?.icon ?? null,
        amount: balance.amount,
        usdValue,
      });
    }

    // Sort by USD value descending
    tokens.sort((a, b) => b.usdValue - a.usdValue);

    return {
      totalUsd: Math.round(totalUsd * 100) / 100,
      tokens,
    };
  },
});
