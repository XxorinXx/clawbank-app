/**
 * Pure spending limit decision logic.
 * No Convex/Solana dependencies — fully unit-testable.
 */

const PERIOD_DURATION_MS: Record<string, number> = {
  daily: 86_400_000,
  weekly: 604_800_000,
  monthly: 2_592_000_000, // 30 days
};

export interface SpendingLimitCheck {
  spentAmount: number;
  limitAmount: number;
  /** The request amount in the same unit as limitAmount/spentAmount (SOL, not lamports). */
  requestAmount: number;
  periodStart: number;
  periodType: string;
  now?: number;
}

/**
 * @deprecated Use `requestAmount` instead. This alias exists for backwards compatibility.
 */
export type SpendingLimitCheckLegacy = Omit<SpendingLimitCheck, "requestAmount"> & {
  requestAmountLamports: number;
};

export interface SpendingLimitResult {
  allowed: boolean;
  effectiveSpent: number;
  remaining: number;
  periodExpired: boolean;
}

/**
 * Determines whether a transfer amount is within the agent's spending limit.
 *
 * If the period has expired, spentAmount resets to 0 for the decision.
 * Returns whether the transfer is allowed and the remaining budget.
 */
export function checkSpendingLimit(params: SpendingLimitCheck | SpendingLimitCheckLegacy): SpendingLimitResult {
  const requestAmount = "requestAmount" in params
    ? params.requestAmount
    : (params as SpendingLimitCheckLegacy).requestAmountLamports;

  const {
    spentAmount,
    limitAmount,
    periodStart,
    periodType,
    now = Date.now(),
  } = params;

  const durationMs = PERIOD_DURATION_MS[periodType];
  if (durationMs === undefined) {
    return { allowed: false, effectiveSpent: spentAmount, remaining: 0, periodExpired: false };
  }

  const periodExpired = now >= periodStart + durationMs;
  const effectiveSpent = periodExpired ? 0 : spentAmount;
  const remaining = Math.max(0, limitAmount - effectiveSpent);
  const allowed = requestAmount > 0 && (effectiveSpent + requestAmount) <= limitAmount;

  return { allowed, effectiveSpent, remaining, periodExpired };
}

const LAMPORTS_PER_SOL = 1_000_000_000;

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

export function solToLamports(sol: number): number {
  return Math.round(sol * LAMPORTS_PER_SOL);
}
