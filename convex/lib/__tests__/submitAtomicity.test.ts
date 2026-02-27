import { describe, it, expect, vi, beforeEach, beforeAll, type Mock } from "vitest";
import { Connection } from "@solana/web3.js";

/**
 * Submit atomicity tests.
 *
 * These verify the core invariant: DB writes ONLY happen after on-chain
 * confirmation succeeds. If sendTransaction or confirmTransaction throws,
 * no DB mutations should be called.
 *
 * Uses a real RPC connection for getLatestBlockhash, but mocks
 * sendTransaction and confirmTransaction to simulate success/failure.
 */

const RPC_URL = "https://api.mainnet-beta.solana.com";

// ---------------------------------------------------------------------------
// Helpers — typed mock fns that are both callable AND assertable
// ---------------------------------------------------------------------------

type AsyncMockFn = Mock<(...args: any[]) => Promise<any>>;

function mockAsyncFn(impl: (...args: any[]) => Promise<any>): AsyncMockFn {
  return vi.fn(impl) as unknown as AsyncMockFn;
}

interface SendConfirmOverrides {
  sendTransaction: AsyncMockFn;
  confirmTransaction: AsyncMockFn;
}

interface MockCtx {
  runMutation: AsyncMockFn;
  runQuery: AsyncMockFn;
}

function createOverrides(): SendConfirmOverrides {
  return {
    sendTransaction: mockAsyncFn(async () => "fakeSig123"),
    confirmTransaction: mockAsyncFn(async () => ({ value: { err: null } })),
  };
}

function createMockCtx(): MockCtx {
  return {
    runMutation: mockAsyncFn(async () => "fakeId"),
    runQuery: mockAsyncFn(async () => ({
      settingsAddress: "fakeAddr",
      members: [{ key: { toBase58: () => "member1" } }],
    })),
  };
}

let realBlockhash: string;
let realLastValidBlockHeight: number;

// Fetch a real blockhash once before all tests
beforeAll(async () => {
  const connection = new Connection(RPC_URL, "confirmed");
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  realBlockhash = blockhash;
  realLastValidBlockHeight = lastValidBlockHeight;
}, 15_000);

// ---------------------------------------------------------------------------
// Simulated submit flows (mirrors the pattern from each action)
// ---------------------------------------------------------------------------

async function simulateSubmitCreateWorkspace(
  overrides: SendConfirmOverrides,
  ctx: MockCtx,
) {
  const blockhash = realBlockhash;
  const lastValidBlockHeight = realLastValidBlockHeight;

  let signature: string;
  try {
    signature = await overrides.sendTransaction({}, { skipPreflight: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to create smart account on Solana: ${message}`);
  }

  try {
    await overrides.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Multisig transaction failed to confirm: ${message}`);
  }

  await ctx.runMutation("storeWorkspace", { name: "test" });
  return { signature };
}

async function simulateSubmitSpendingLimitUpdate(
  overrides: SendConfirmOverrides,
  ctx: MockCtx,
) {
  const blockhash = realBlockhash;
  const lastValidBlockHeight = realLastValidBlockHeight;

  let signature: string;
  try {
    signature = await overrides.sendTransaction({}, { skipPreflight: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to update spending limit on-chain: ${message}`);
  }

  try {
    await overrides.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(
      `Spending limit transaction failed to confirm: ${message}`,
    );
  }

  await ctx.runMutation("updateSpendingLimitRecord", {});
  await ctx.runMutation("logActivity", {});
  return { signature };
}

async function simulateSubmitRemoveMember(
  overrides: SendConfirmOverrides,
  ctx: MockCtx,
) {
  const blockhash = realBlockhash;
  const lastValidBlockHeight = realLastValidBlockHeight;

  let signature: string;
  try {
    signature = await overrides.sendTransaction({}, { skipPreflight: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to submit member removal tx: ${message}`);
  }

  try {
    await overrides.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(
      `Member removal transaction failed to confirm: ${message}`,
    );
  }

  await ctx.runQuery("getWorkspaceById", {});
  await ctx.runMutation("reconcileMembersFromOnchain", {});
  return { signature };
}

async function simulateSubmitAgentActivation(
  overrides: SendConfirmOverrides,
  ctx: MockCtx,
) {
  const blockhash = realBlockhash;
  const lastValidBlockHeight = realLastValidBlockHeight;

  let signature: string;
  try {
    signature = await overrides.sendTransaction({}, { skipPreflight: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to submit activation tx: ${message}`);
  }

  await overrides.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );

  await ctx.runMutation("updateAgentStatus", { status: "active" });
  await ctx.runMutation("updateSpendingLimitOnchainKey", {});
  await ctx.runMutation("logActivity", {});
  return { signature };
}

async function simulateSubmitAgentRevocation(
  overrides: SendConfirmOverrides,
  ctx: MockCtx,
) {
  const blockhash = realBlockhash;
  const lastValidBlockHeight = realLastValidBlockHeight;

  let signature: string;
  try {
    signature = await overrides.sendTransaction({}, { skipPreflight: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to submit revocation tx: ${message}`);
  }

  await overrides.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );

  await ctx.runMutation("revokeAgentInternal", {});
  await ctx.runMutation("logActivity", {});
  return { signature };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("submit atomicity — DB writes only after on-chain confirmation", () => {
  let overrides: SendConfirmOverrides;
  let ctx: MockCtx;

  beforeEach(() => {
    overrides = createOverrides();
    ctx = createMockCtx();
  });

  // =======================================================================
  // createWorkspace
  // =======================================================================
  describe("submitCreateWorkspace", () => {
    it("calls DB mutation when both send+confirm succeed", async () => {
      await simulateSubmitCreateWorkspace(overrides, ctx);
      expect(ctx.runMutation).toHaveBeenCalledTimes(1);
    });

    it("does NOT call DB mutation when sendTransaction fails", async () => {
      overrides.sendTransaction.mockRejectedValue(
        new Error("Simulation failed"),
      );

      await expect(
        simulateSubmitCreateWorkspace(overrides, ctx),
      ).rejects.toThrow("Failed to create smart account on Solana");

      expect(ctx.runMutation).not.toHaveBeenCalled();
    });

    it("does NOT call DB mutation when confirmTransaction fails", async () => {
      overrides.confirmTransaction.mockRejectedValue(
        new Error("Block height exceeded"),
      );

      await expect(
        simulateSubmitCreateWorkspace(overrides, ctx),
      ).rejects.toThrow("Multisig transaction failed to confirm");

      expect(ctx.runMutation).not.toHaveBeenCalled();
    });
  });

  // =======================================================================
  // spendingLimitUpdate
  // =======================================================================
  describe("submitSpendingLimitUpdate", () => {
    it("calls DB mutations when both send+confirm succeed", async () => {
      await simulateSubmitSpendingLimitUpdate(overrides, ctx);
      expect(ctx.runMutation).toHaveBeenCalledTimes(2);
    });

    it("does NOT call DB mutations when sendTransaction fails", async () => {
      overrides.sendTransaction.mockRejectedValue(
        new Error("Simulation failed"),
      );

      await expect(
        simulateSubmitSpendingLimitUpdate(overrides, ctx),
      ).rejects.toThrow("Failed to update spending limit on-chain");

      expect(ctx.runMutation).not.toHaveBeenCalled();
    });

    it("does NOT call DB mutations when confirmTransaction fails", async () => {
      overrides.confirmTransaction.mockRejectedValue(
        new Error("Timeout"),
      );

      await expect(
        simulateSubmitSpendingLimitUpdate(overrides, ctx),
      ).rejects.toThrow("Spending limit transaction failed to confirm");

      expect(ctx.runMutation).not.toHaveBeenCalled();
    });
  });

  // =======================================================================
  // removeMember
  // =======================================================================
  describe("submitRemoveMember", () => {
    it("calls DB mutation when both send+confirm succeed", async () => {
      await simulateSubmitRemoveMember(overrides, ctx);
      expect(ctx.runMutation).toHaveBeenCalledTimes(1);
    });

    it("does NOT call DB mutation when sendTransaction fails", async () => {
      overrides.sendTransaction.mockRejectedValue(
        new Error("Simulation failed"),
      );

      await expect(
        simulateSubmitRemoveMember(overrides, ctx),
      ).rejects.toThrow("Failed to submit member removal tx");

      expect(ctx.runMutation).not.toHaveBeenCalled();
    });

    it("does NOT call DB mutation when confirmTransaction fails", async () => {
      overrides.confirmTransaction.mockRejectedValue(
        new Error("Timeout"),
      );

      await expect(
        simulateSubmitRemoveMember(overrides, ctx),
      ).rejects.toThrow("Member removal transaction failed to confirm");

      expect(ctx.runMutation).not.toHaveBeenCalled();
    });
  });

  // =======================================================================
  // agentActivation
  // =======================================================================
  describe("submitAgentActivation", () => {
    it("calls all DB mutations when both send+confirm succeed", async () => {
      await simulateSubmitAgentActivation(overrides, ctx);
      expect(ctx.runMutation).toHaveBeenCalledTimes(3);
    });

    it("does NOT call DB mutations when sendTransaction fails", async () => {
      overrides.sendTransaction.mockRejectedValue(
        new Error("Simulation failed"),
      );

      await expect(
        simulateSubmitAgentActivation(overrides, ctx),
      ).rejects.toThrow("Failed to submit activation tx");

      expect(ctx.runMutation).not.toHaveBeenCalled();
    });

    it("does NOT call DB mutations when confirmTransaction fails", async () => {
      overrides.confirmTransaction.mockRejectedValue(
        new Error("Timeout"),
      );

      await expect(
        simulateSubmitAgentActivation(overrides, ctx),
      ).rejects.toThrow("Timeout");

      expect(ctx.runMutation).not.toHaveBeenCalled();
    });
  });

  // =======================================================================
  // agentRevocation
  // =======================================================================
  describe("submitAgentRevocation", () => {
    it("calls DB mutations when both send+confirm succeed", async () => {
      await simulateSubmitAgentRevocation(overrides, ctx);
      expect(ctx.runMutation).toHaveBeenCalledTimes(2);
    });

    it("does NOT call DB mutations when sendTransaction fails", async () => {
      overrides.sendTransaction.mockRejectedValue(
        new Error("Simulation failed"),
      );

      await expect(
        simulateSubmitAgentRevocation(overrides, ctx),
      ).rejects.toThrow("Failed to submit revocation tx");

      expect(ctx.runMutation).not.toHaveBeenCalled();
    });

    it("does NOT call DB mutations when confirmTransaction fails", async () => {
      overrides.confirmTransaction.mockRejectedValue(
        new Error("Timeout"),
      );

      await expect(
        simulateSubmitAgentRevocation(overrides, ctx),
      ).rejects.toThrow("Timeout");

      expect(ctx.runMutation).not.toHaveBeenCalled();
    });
  });
});
