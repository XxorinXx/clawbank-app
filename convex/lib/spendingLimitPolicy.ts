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
  requestAmountLamports: number;
  periodStart: number;
  periodType: string;
  now?: number;
}

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
export function checkSpendingLimit(params: SpendingLimitCheck): SpendingLimitResult {
  const {
    spentAmount,
    limitAmount,
    requestAmountLamports,
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
  const allowed = requestAmountLamports > 0 && (effectiveSpent + requestAmountLamports) <= limitAmount;

  return { allowed, effectiveSpent, remaining, periodExpired };
}

const LAMPORTS_PER_SOL = 1_000_000_000;

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

export function solToLamports(sol: number): number {
  return Math.round(sol * LAMPORTS_PER_SOL);
}
