import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

const RPC_URL = "https://api.mainnet-beta.solana.com";

// We mock the @sqds/smart-account module so the instruction builders return
// plain objects whose arguments we can inspect. This lets us assert on
// the exact keys passed to each Smart Account instruction.
vi.mock("@sqds/smart-account", () => {
  // Track every instruction call for inspection
  const calls = {
    createSmartAccount: [] as any[],
    addSignerAsAuthority: [] as any[],
    removeSignerAsAuthority: [] as any[],
    addSpendingLimitAsAuthority: [] as any[],
    removeSpendingLimitAsAuthority: [] as any[],
  };

  const makeFakeInstruction = (name: string, args: any) => {
    // Return a minimal instruction-like object that TransactionMessage accepts
    return {
      programId: new PublicKey("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf"),
      keys: [],
      data: Buffer.alloc(0),
      _name: name,
      _args: args,
    };
  };

  return {
    getSpendingLimitPda: ({ settingsPda, seed }: { settingsPda: PublicKey; seed: PublicKey }) => {
      // Return [seed] as a deterministic fake PDA
      return [seed];
    },
    transactions: {},
    instructions: {
      createSmartAccount: (args: any) => {
        calls.createSmartAccount.push(args);
        return makeFakeInstruction("createSmartAccount", args);
      },
      addSignerAsAuthority: (args: any) => {
        calls.addSignerAsAuthority.push(args);
        return makeFakeInstruction("addSignerAsAuthority", args);
      },
      removeSignerAsAuthority: (args: any) => {
        calls.removeSignerAsAuthority.push(args);
        return makeFakeInstruction("removeSignerAsAuthority", args);
      },
      addSpendingLimitAsAuthority: (args: any) => {
        calls.addSpendingLimitAsAuthority.push(args);
        return makeFakeInstruction("addSpendingLimitAsAuthority", args);
      },
      removeSpendingLimitAsAuthority: (args: any) => {
        calls.removeSpendingLimitAsAuthority.push(args);
        return makeFakeInstruction("removeSpendingLimitAsAuthority", args);
      },
    },
    types: {
      Permissions: {
        all: () => ({ mask: 7 }),
        fromPermissions: (perms: any[]) => ({ mask: perms.length }),
      },
      Permission: {
        Initiate: 1,
        Vote: 2,
        Execute: 4,
      },
      Period: {
        OneTime: 0,
        Day: 1,
        Week: 2,
        Month: 3,
      },
    },
    // Expose calls for test assertions
    _testCalls: calls,
    _resetCalls: () => {
      calls.createSmartAccount = [];
      calls.addSignerAsAuthority = [];
      calls.removeSignerAsAuthority = [];
      calls.addSpendingLimitAsAuthority = [];
      calls.removeSpendingLimitAsAuthority = [];
    },
  };
});

import * as smartAccountMock from "@sqds/smart-account";
import {
  buildCreateWorkspaceTxCore,
  buildSpendingLimitUpdateTxCore,
  buildRemoveMemberTxCore,
  buildAgentActivationTxCore,
  buildAgentRevocationTxCore,
} from "../txBuilders";

const mock = smartAccountMock as any;

// Stable test keys
const USER_WALLET = Keypair.generate().publicKey;
const SPONSOR_PUBKEY = Keypair.generate().publicKey;
const AGENT_PUBKEY = Keypair.generate().publicKey;
const SETTINGS_PDA = Keypair.generate().publicKey;
const SEED = Keypair.generate().publicKey;
const TOKEN_MINT = Keypair.generate().publicKey;
const MEMBER_TO_REMOVE = Keypair.generate().publicKey;
const EXTRA_MEMBER = Keypair.generate().publicKey;
const TREASURY = Keypair.generate().publicKey;

// Fetch a real blockhash from mainnet once before all tests
let BLOCKHASH: string;

beforeAll(async () => {
  const connection = new Connection(RPC_URL, "confirmed");
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  BLOCKHASH = blockhash;
}, 15_000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function expectKeyEquals(actual: PublicKey, expected: PublicKey, label: string) {
  expect(actual.toBase58(), `${label} mismatch`).toBe(expected.toBase58());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("txBuilders — sponsor role invariants", () => {
  beforeEach(() => {
    mock._resetCalls();
  });

  // =======================================================================
  // createWorkspace
  // =======================================================================
  describe("buildCreateWorkspaceTxCore", () => {
    it("sets creator to userWallet (not sponsor)", () => {
      buildCreateWorkspaceTxCore({
        creatorWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        walletMemberKeys: [EXTRA_MEMBER],
        settingsPda: SETTINGS_PDA,
        treasury: TREASURY,
        blockhash: BLOCKHASH,
      });

      const call = mock._testCalls.createSmartAccount[0];
      expect(call).toBeDefined();
      expectKeyEquals(call.creator, USER_WALLET, "creator");
    });

    it("sponsor is NOT in the signers array", () => {
      buildCreateWorkspaceTxCore({
        creatorWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        walletMemberKeys: [EXTRA_MEMBER],
        settingsPda: SETTINGS_PDA,
        treasury: TREASURY,
        blockhash: BLOCKHASH,
      });

      const call = mock._testCalls.createSmartAccount[0];
      const signerKeys = call.signers.map((s: any) => s.key.toBase58());
      expect(signerKeys).not.toContain(SPONSOR_PUBKEY.toBase58());
    });

    it("signers include creator + wallet members", () => {
      const result = buildCreateWorkspaceTxCore({
        creatorWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        walletMemberKeys: [EXTRA_MEMBER],
        settingsPda: SETTINGS_PDA,
        treasury: TREASURY,
        blockhash: BLOCKHASH,
      });

      expect(result.signers).toHaveLength(2);
      expectKeyEquals(result.signers[0].key, USER_WALLET, "signers[0]");
      expectKeyEquals(result.signers[1].key, EXTRA_MEMBER, "signers[1]");
    });

    it("returns a VersionedTransaction", () => {
      const result = buildCreateWorkspaceTxCore({
        creatorWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        walletMemberKeys: [],
        settingsPda: SETTINGS_PDA,
        treasury: TREASURY,
        blockhash: BLOCKHASH,
      });

      expect(result.tx).toBeDefined();
      expect(result.tx.serialize).toBeTypeOf("function");
    });
  });

  // =======================================================================
  // spendingLimitUpdate
  // =======================================================================
  describe("buildSpendingLimitUpdateTxCore", () => {
    it("fresh limit: 1 addSpendingLimitAsAuthority instruction", () => {
      const result = buildSpendingLimitUpdateTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        settingsPda: SETTINGS_PDA,
        agentPubkey: AGENT_PUBKEY,
        oldSeed: null,
        seed: SEED,
        tokenMint: TOKEN_MINT,
        limitAmount: 100,
        decimals: 6,
        periodType: "daily",
        blockhash: BLOCKHASH,
      });

      const addCalls = mock._testCalls.addSpendingLimitAsAuthority;
      const removeCalls = mock._testCalls.removeSpendingLimitAsAuthority;

      expect(addCalls).toHaveLength(1);
      expect(removeCalls).toHaveLength(0);
      expect(result.instructions).toHaveLength(1);
    });

    it("with old limit: removeSpendingLimitAsAuthority + addSpendingLimitAsAuthority (2 instructions)", () => {
      const OLD_SEED = Keypair.generate().publicKey;

      const result = buildSpendingLimitUpdateTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        settingsPda: SETTINGS_PDA,
        agentPubkey: AGENT_PUBKEY,
        oldSeed: OLD_SEED.toBase58(),
        seed: SEED,
        tokenMint: TOKEN_MINT,
        limitAmount: 100,
        decimals: 6,
        periodType: "weekly",
        blockhash: BLOCKHASH,
      });

      const addCalls = mock._testCalls.addSpendingLimitAsAuthority;
      const removeCalls = mock._testCalls.removeSpendingLimitAsAuthority;

      expect(removeCalls).toHaveLength(1);
      expect(addCalls).toHaveLength(1);
      expect(result.instructions).toHaveLength(2);
    });

    it("userWallet is settingsAuthority, sponsor is rentPayer/rentCollector", () => {
      const OLD_SEED = Keypair.generate().publicKey;

      buildSpendingLimitUpdateTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        settingsPda: SETTINGS_PDA,
        agentPubkey: AGENT_PUBKEY,
        oldSeed: OLD_SEED.toBase58(),
        seed: SEED,
        tokenMint: TOKEN_MINT,
        limitAmount: 100,
        decimals: 6,
        periodType: "daily",
        blockhash: BLOCKHASH,
      });

      // removeSpendingLimitAsAuthority
      const removeCall = mock._testCalls.removeSpendingLimitAsAuthority[0];
      expectKeyEquals(removeCall.settingsAuthority, USER_WALLET, "remove.settingsAuthority");
      expectKeyEquals(removeCall.rentCollector, SPONSOR_PUBKEY, "remove.rentCollector");

      // addSpendingLimitAsAuthority
      const addCall = mock._testCalls.addSpendingLimitAsAuthority[0];
      expectKeyEquals(addCall.settingsAuthority, USER_WALLET, "add.settingsAuthority");
      expectKeyEquals(addCall.rentPayer, SPONSOR_PUBKEY, "add.rentPayer");
    });

    it("sponsor never appears as settingsAuthority", () => {
      buildSpendingLimitUpdateTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        settingsPda: SETTINGS_PDA,
        agentPubkey: AGENT_PUBKEY,
        oldSeed: Keypair.generate().publicKey.toBase58(),
        seed: SEED,
        tokenMint: TOKEN_MINT,
        limitAmount: 100,
        decimals: 6,
        periodType: "daily",
        blockhash: BLOCKHASH,
      });

      for (const call of mock._testCalls.addSpendingLimitAsAuthority) {
        expect(call.settingsAuthority.toBase58()).not.toBe(SPONSOR_PUBKEY.toBase58());
      }
      for (const call of mock._testCalls.removeSpendingLimitAsAuthority) {
        expect(call.settingsAuthority.toBase58()).not.toBe(SPONSOR_PUBKEY.toBase58());
      }
    });
  });

  // =======================================================================
  // removeMember
  // =======================================================================
  describe("buildRemoveMemberTxCore", () => {
    it("builds 1 instruction (removeSignerAsAuthority)", () => {
      const result = buildRemoveMemberTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        settingsPda: SETTINGS_PDA,
        memberToRemove: MEMBER_TO_REMOVE,
        blockhash: BLOCKHASH,
      });

      expect(result.instructions).toHaveLength(1);
      expect(mock._testCalls.removeSignerAsAuthority).toHaveLength(1);
    });

    it("userWallet is settingsAuthority", () => {
      buildRemoveMemberTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        settingsPda: SETTINGS_PDA,
        memberToRemove: MEMBER_TO_REMOVE,
        blockhash: BLOCKHASH,
      });

      const call = mock._testCalls.removeSignerAsAuthority[0];
      expectKeyEquals(call.settingsAuthority, USER_WALLET, "settingsAuthority");
    });

    it("targets the correct oldSigner", () => {
      buildRemoveMemberTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        settingsPda: SETTINGS_PDA,
        memberToRemove: MEMBER_TO_REMOVE,
        blockhash: BLOCKHASH,
      });

      const call = mock._testCalls.removeSignerAsAuthority[0];
      expectKeyEquals(call.oldSigner, MEMBER_TO_REMOVE, "oldSigner");
    });

    it("sponsor key never appears as settingsAuthority", () => {
      buildRemoveMemberTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        settingsPda: SETTINGS_PDA,
        memberToRemove: MEMBER_TO_REMOVE,
        blockhash: BLOCKHASH,
      });

      for (const call of mock._testCalls.removeSignerAsAuthority) {
        expect(call.settingsAuthority.toBase58()).not.toBe(SPONSOR_PUBKEY.toBase58());
      }
    });
  });

  // =======================================================================
  // agentActivation
  // =======================================================================
  describe("buildAgentActivationTxCore", () => {
    it("builds 2 instructions (addSignerAsAuthority + addSpendingLimitAsAuthority)", () => {
      const result = buildAgentActivationTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        settingsPda: SETTINGS_PDA,
        agentPubkey: AGENT_PUBKEY,
        seed: SEED,
        tokenMint: TOKEN_MINT,
        limitAmount: 100,
        decimals: 6,
        periodType: "daily",
        blockhash: BLOCKHASH,
      });

      expect(result.instructions).toHaveLength(2);
      expect(mock._testCalls.addSignerAsAuthority).toHaveLength(1);
      expect(mock._testCalls.addSpendingLimitAsAuthority).toHaveLength(1);
    });

    it("userWallet is settingsAuthority, sponsor is rentPayer", () => {
      buildAgentActivationTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        settingsPda: SETTINGS_PDA,
        agentPubkey: AGENT_PUBKEY,
        seed: SEED,
        tokenMint: TOKEN_MINT,
        limitAmount: 100,
        decimals: 6,
        periodType: "daily",
        blockhash: BLOCKHASH,
      });

      const signerCall = mock._testCalls.addSignerAsAuthority[0];
      expectKeyEquals(signerCall.settingsAuthority, USER_WALLET, "signer.settingsAuthority");
      expectKeyEquals(signerCall.rentPayer, SPONSOR_PUBKEY, "signer.rentPayer");

      const limitCall = mock._testCalls.addSpendingLimitAsAuthority[0];
      expectKeyEquals(limitCall.settingsAuthority, USER_WALLET, "limit.settingsAuthority");
      expectKeyEquals(limitCall.rentPayer, SPONSOR_PUBKEY, "limit.rentPayer");
    });

    it("agent key in newSigner with Initiate permission", () => {
      buildAgentActivationTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        settingsPda: SETTINGS_PDA,
        agentPubkey: AGENT_PUBKEY,
        seed: SEED,
        tokenMint: TOKEN_MINT,
        limitAmount: 100,
        decimals: 6,
        periodType: "daily",
        blockhash: BLOCKHASH,
      });

      const signerCall = mock._testCalls.addSignerAsAuthority[0];
      expectKeyEquals(signerCall.newSigner.key, AGENT_PUBKEY, "newSigner.key");
      // fromPermissions([Initiate]) → {mask: 1} (length of array)
      expect(signerCall.newSigner.permissions.mask).toBe(1);
    });

    it("sponsor key never appears as settingsAuthority", () => {
      buildAgentActivationTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        settingsPda: SETTINGS_PDA,
        agentPubkey: AGENT_PUBKEY,
        seed: SEED,
        tokenMint: TOKEN_MINT,
        limitAmount: 100,
        decimals: 6,
        periodType: "daily",
        blockhash: BLOCKHASH,
      });

      for (const call of mock._testCalls.addSignerAsAuthority) {
        expect(call.settingsAuthority.toBase58()).not.toBe(SPONSOR_PUBKEY.toBase58());
      }
      for (const call of mock._testCalls.addSpendingLimitAsAuthority) {
        expect(call.settingsAuthority.toBase58()).not.toBe(SPONSOR_PUBKEY.toBase58());
      }
    });
  });

  // =======================================================================
  // agentRevocation
  // =======================================================================
  describe("buildAgentRevocationTxCore", () => {
    it("without spending limit: 1 instruction (removeSignerAsAuthority)", () => {
      const result = buildAgentRevocationTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        settingsPda: SETTINGS_PDA,
        agentPubkey: AGENT_PUBKEY,
        oldSeed: null,
        blockhash: BLOCKHASH,
      });

      expect(result.instructions).toHaveLength(1);
      expect(mock._testCalls.removeSignerAsAuthority).toHaveLength(1);
      expect(mock._testCalls.removeSpendingLimitAsAuthority).toHaveLength(0);
    });

    it("with spending limit: 2 instructions (removeSignerAsAuthority + removeSpendingLimitAsAuthority)", () => {
      const OLD_SEED = Keypair.generate().publicKey;

      const result = buildAgentRevocationTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        settingsPda: SETTINGS_PDA,
        agentPubkey: AGENT_PUBKEY,
        oldSeed: OLD_SEED.toBase58(),
        blockhash: BLOCKHASH,
      });

      expect(result.instructions).toHaveLength(2);
      expect(mock._testCalls.removeSignerAsAuthority).toHaveLength(1);
      expect(mock._testCalls.removeSpendingLimitAsAuthority).toHaveLength(1);
    });

    it("removeSignerAsAuthority targets agent key", () => {
      buildAgentRevocationTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        settingsPda: SETTINGS_PDA,
        agentPubkey: AGENT_PUBKEY,
        oldSeed: null,
        blockhash: BLOCKHASH,
      });

      const call = mock._testCalls.removeSignerAsAuthority[0];
      expectKeyEquals(call.oldSigner, AGENT_PUBKEY, "oldSigner");
    });

    it("sponsor never appears as settingsAuthority", () => {
      buildAgentRevocationTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        settingsPda: SETTINGS_PDA,
        agentPubkey: AGENT_PUBKEY,
        oldSeed: Keypair.generate().publicKey.toBase58(),
        blockhash: BLOCKHASH,
      });

      for (const call of mock._testCalls.removeSignerAsAuthority) {
        expect(call.settingsAuthority.toBase58()).not.toBe(SPONSOR_PUBKEY.toBase58());
      }
      for (const call of mock._testCalls.removeSpendingLimitAsAuthority) {
        expect(call.settingsAuthority.toBase58()).not.toBe(SPONSOR_PUBKEY.toBase58());
      }
    });
  });
});
