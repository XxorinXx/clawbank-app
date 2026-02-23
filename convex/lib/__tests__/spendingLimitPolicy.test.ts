import { describe, it, expect } from "vitest";
import {
  checkSpendingLimit,
  lamportsToSol,
  solToLamports,
} from "../spendingLimitPolicy";

const SOL = 1_000_000_000; // lamports per SOL

describe("checkSpendingLimit", () => {
  const base = {
    periodStart: 0,
    periodType: "daily" as const,
    now: 1000, // well within the first period
  };

  it("allows when amount fits within remaining budget", () => {
    const result = checkSpendingLimit({
      ...base,
      spentAmount: 1 * SOL,
      limitAmount: 10 * SOL,
      requestAmountLamports: 2 * SOL,
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9 * SOL);
    expect(result.periodExpired).toBe(false);
  });

  it("allows when exactly at limit (spent + request = limit)", () => {
    const result = checkSpendingLimit({
      ...base,
      spentAmount: 8 * SOL,
      limitAmount: 10 * SOL,
      requestAmountLamports: 2 * SOL,
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2 * SOL);
    expect(result.effectiveSpent).toBe(8 * SOL);
  });

  it("denies when over limit", () => {
    const result = checkSpendingLimit({
      ...base,
      spentAmount: 9 * SOL,
      limitAmount: 10 * SOL,
      requestAmountLamports: 2 * SOL,
    });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(1 * SOL);
  });

  it("denies when limitAmount is zero", () => {
    const result = checkSpendingLimit({
      ...base,
      spentAmount: 0,
      limitAmount: 0,
      requestAmountLamports: 1,
    });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("denies when requestAmount is zero", () => {
    const result = checkSpendingLimit({
      ...base,
      spentAmount: 0,
      limitAmount: 10 * SOL,
      requestAmountLamports: 0,
    });
    expect(result.allowed).toBe(false);
  });

  it("resets spent when daily period has expired", () => {
    const result = checkSpendingLimit({
      ...base,
      spentAmount: 10 * SOL,
      limitAmount: 10 * SOL,
      requestAmountLamports: 1 * SOL,
      periodStart: 0,
      now: 86_400_000 + 1, // just past 24h
    });
    expect(result.periodExpired).toBe(true);
    expect(result.effectiveSpent).toBe(0);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(10 * SOL);
  });

  it("does NOT reset spent when period has NOT expired", () => {
    const result = checkSpendingLimit({
      ...base,
      spentAmount: 5 * SOL,
      limitAmount: 10 * SOL,
      requestAmountLamports: 1 * SOL,
      periodStart: 0,
      now: 86_400_000 - 1, // just before 24h
    });
    expect(result.periodExpired).toBe(false);
    expect(result.effectiveSpent).toBe(5 * SOL);
    expect(result.remaining).toBe(5 * SOL);
  });

  it("allows again after period expires even if was over limit", () => {
    // During period: fully spent
    const during = checkSpendingLimit({
      ...base,
      spentAmount: 10 * SOL,
      limitAmount: 10 * SOL,
      requestAmountLamports: 1 * SOL,
      now: 1000,
    });
    expect(during.allowed).toBe(false);

    // After period: resets
    const after = checkSpendingLimit({
      ...base,
      spentAmount: 10 * SOL,
      limitAmount: 10 * SOL,
      requestAmountLamports: 1 * SOL,
      now: 86_400_000 + 1,
    });
    expect(after.allowed).toBe(true);
    expect(after.periodExpired).toBe(true);
    expect(after.effectiveSpent).toBe(0);
  });

  it("handles weekly period duration", () => {
    const result = checkSpendingLimit({
      spentAmount: 5 * SOL,
      limitAmount: 10 * SOL,
      requestAmountLamports: 1 * SOL,
      periodStart: 0,
      periodType: "weekly",
      now: 604_800_000 + 1, // just past 7 days
    });
    expect(result.periodExpired).toBe(true);
    expect(result.effectiveSpent).toBe(0);
    expect(result.allowed).toBe(true);
  });

  it("handles monthly period duration", () => {
    const result = checkSpendingLimit({
      spentAmount: 5 * SOL,
      limitAmount: 10 * SOL,
      requestAmountLamports: 1 * SOL,
      periodStart: 0,
      periodType: "monthly",
      now: 2_592_000_000 + 1, // just past 30 days
    });
    expect(result.periodExpired).toBe(true);
    expect(result.effectiveSpent).toBe(0);
    expect(result.allowed).toBe(true);
  });

  it("denies on invalid period type", () => {
    const result = checkSpendingLimit({
      spentAmount: 0,
      limitAmount: 10 * SOL,
      requestAmountLamports: 1 * SOL,
      periodStart: 0,
      periodType: "biweekly",
      now: 1000,
    });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.periodExpired).toBe(false);
  });
});

describe("lamportsToSol", () => {
  it("converts 1 billion lamports to 1 SOL", () => {
    expect(lamportsToSol(1_000_000_000)).toBe(1);
  });

  it("converts 0 lamports to 0 SOL", () => {
    expect(lamportsToSol(0)).toBe(0);
  });

  it("converts 500 million lamports to 0.5 SOL", () => {
    expect(lamportsToSol(500_000_000)).toBe(0.5);
  });
});

describe("solToLamports", () => {
  it("converts 1 SOL to 1 billion lamports", () => {
    expect(solToLamports(1)).toBe(1_000_000_000);
  });

  it("converts 0.5 SOL to 500 million lamports", () => {
    expect(solToLamports(0.5)).toBe(500_000_000);
  });

  it("rounds correctly for fractional lamports", () => {
    // 0.0000000015 SOL = 1.5 lamports → rounds to 2
    expect(solToLamports(0.0000000015)).toBe(2);
  });
});
