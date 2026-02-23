import type { Id } from "../../convex/_generated/dataModel";

// ── Branded helper ────────────────────────────────────────────────────

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

/** A Solana mint address string. */
export type MintAddress = Brand<string, "MintAddress">;

/** A Solana wallet / public-key address string. */
export type WalletAddress = Brand<string, "WalletAddress">;

// ── Token types (mirror Convex action return shapes) ──────────────────

export interface TokenMetadata {
  readonly mint: string;
  readonly symbol: string;
  readonly name: string;
  readonly icon?: string;
  readonly decimals: number;
}

export interface TokenPrice {
  readonly mint: string;
  readonly priceUsd: number;
}

export interface TokenBalanceInfo {
  readonly mint: string;
  readonly symbol: string;
  readonly name: string;
  readonly icon: string | null;
  readonly amount: string;
  readonly usdValue: number;
}

export interface WorkspaceBalance {
  readonly totalUsd: number;
  readonly tokens: TokenBalanceInfo[];
}

// ── Member types ──────────────────────────────────────────────────────

export interface MemberPermissions {
  readonly initiate: boolean;
  readonly vote: boolean;
  readonly execute: boolean;
}

export interface OnchainMember {
  readonly pubkey: string;
  readonly permissions: MemberPermissions;
}

export type MemberRole = "creator" | "member";

export interface MergedMember {
  readonly walletAddress: string;
  readonly role: MemberRole;
  readonly permissions: MemberPermissions | null;
  readonly addedAt: number;
}

// ── Query key factory ─────────────────────────────────────────────────

export const queryKeys = {
  tokenMetadata: (mints: readonly string[]) =>
    ["tokenMetadata", [...mints].sort().join(",")] as const,

  tokenPrices: (mints: readonly string[]) =>
    ["tokenPrices", [...mints].sort().join(",")] as const,

  workspaceBalance: (workspaceId: Id<"workspaces"> | null) =>
    ["workspaceBalance", workspaceId] as const,

  membersOnchain: (workspaceId: Id<"workspaces"> | null) =>
    ["membersOnchain", workspaceId] as const,
} as const;
