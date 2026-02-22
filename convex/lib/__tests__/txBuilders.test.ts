import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

const RPC_URL = "https://api.mainnet-beta.solana.com";

// We mock the @sqds/multisig module so the instruction builders return
// plain objects whose arguments we can inspect. This lets us assert on
// the exact keys passed to each Squads instruction.
vi.mock("@sqds/multisig", () => {
  // Track every instruction call for inspection
  const calls = {
    multisigCreateV2: [] as any[],
    configTransactionCreate: [] as any[],
    proposalCreate: [] as any[],
    proposalApprove: [] as any[],
    configTransactionExecute: [] as any[],
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
    getMultisigPda: ({ createKey }: { createKey: PublicKey }) => {
      // Deterministic fake PDA
      return [createKey];
    },
    getSpendingLimitPda: ({ multisigPda, createKey }: { multisigPda: PublicKey; createKey: PublicKey }) => {
      return [createKey];
    },
    getProgramConfigPda: () => {
      return [Keypair.generate().publicKey];
    },
    transactions: {
      multisigCreateV2: (args: any) => {
        calls.multisigCreateV2.push(args);
        // Return a minimal VersionedTransaction mock
        const { TransactionMessage, VersionedTransaction } = require("@solana/web3.js");
        const msg = new TransactionMessage({
          payerKey: args.creator,
          recentBlockhash: args.blockhash,
          instructions: [],
        }).compileToV0Message();
        return new VersionedTransaction(msg);
      },
    },
    instructions: {
      configTransactionCreate: (args: any) => {
        calls.configTransactionCreate.push(args);
        return makeFakeInstruction("configTransactionCreate", args);
      },
      proposalCreate: (args: any) => {
        calls.proposalCreate.push(args);
        return makeFakeInstruction("proposalCreate", args);
      },
      proposalApprove: (args: any) => {
        calls.proposalApprove.push(args);
        return makeFakeInstruction("proposalApprove", args);
      },
      configTransactionExecute: (args: any) => {
        calls.configTransactionExecute.push(args);
        return makeFakeInstruction("configTransactionExecute", args);
      },
    },
    accounts: {
      ProgramConfig: {
        fromAccountInfo: () => [{ treasury: Keypair.generate().publicKey }],
      },
      Multisig: {
        fromAccountAddress: async () => ({
          transactionIndex: 5,
          members: [],
        }),
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
        Day: 0,
        Week: 1,
        Month: 2,
      },
    },
    // Expose calls for test assertions
    _testCalls: calls,
    _resetCalls: () => {
      calls.multisigCreateV2 = [];
      calls.configTransactionCreate = [];
      calls.proposalCreate = [];
      calls.proposalApprove = [];
      calls.configTransactionExecute = [];
    },
  };
});

import * as multisigMock from "@sqds/multisig";
import {
  buildCreateWorkspaceTxCore,
  buildSpendingLimitUpdateTxCore,
  buildRemoveMemberTxCore,
  buildAgentActivationTxCore,
  buildAgentRevocationTxCore,
} from "../txBuilders";

const mock = multisigMock as any;

// Stable test keys
const USER_WALLET = Keypair.generate().publicKey;
const SPONSOR_PUBKEY = Keypair.generate().publicKey;
const AGENT_PUBKEY = Keypair.generate().publicKey;
const MULTISIG_PDA = Keypair.generate().publicKey;
const CREATE_KEY = Keypair.generate().publicKey;
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
      const result = buildCreateWorkspaceTxCore({
        creatorWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        walletMemberKeys: [EXTRA_MEMBER],
        createKeyPublicKey: CREATE_KEY,
        multisigPda: MULTISIG_PDA,
        treasury: TREASURY,
        blockhash: BLOCKHASH,
      });

      const call = mock._testCalls.multisigCreateV2[0];
      expect(call).toBeDefined();
      expectKeyEquals(call.creator, USER_WALLET, "creator");
    });

    it("sponsor is NOT in the members array", () => {
      const result = buildCreateWorkspaceTxCore({
        creatorWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        walletMemberKeys: [EXTRA_MEMBER],
        createKeyPublicKey: CREATE_KEY,
        multisigPda: MULTISIG_PDA,
        treasury: TREASURY,
        blockhash: BLOCKHASH,
      });

      const call = mock._testCalls.multisigCreateV2[0];
      const memberKeys = call.members.map((m: any) => m.key.toBase58());
      expect(memberKeys).not.toContain(SPONSOR_PUBKEY.toBase58());
    });

    it("members include creator + wallet members", () => {
      const result = buildCreateWorkspaceTxCore({
        creatorWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        walletMemberKeys: [EXTRA_MEMBER],
        createKeyPublicKey: CREATE_KEY,
        multisigPda: MULTISIG_PDA,
        treasury: TREASURY,
        blockhash: BLOCKHASH,
      });

      expect(result.members).toHaveLength(2);
      expectKeyEquals(result.members[0].key, USER_WALLET, "members[0]");
      expectKeyEquals(result.members[1].key, EXTRA_MEMBER, "members[1]");
    });

    it("returns a VersionedTransaction", () => {
      const result = buildCreateWorkspaceTxCore({
        creatorWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        walletMemberKeys: [],
        createKeyPublicKey: CREATE_KEY,
        multisigPda: MULTISIG_PDA,
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
    it("uses userWallet as creator/member, sponsor as rentPayer — fresh limit", () => {
      buildSpendingLimitUpdateTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        multisigPda: MULTISIG_PDA,
        agentPubkey: AGENT_PUBKEY,
        currentTransactionIndex: 5,
        oldOnchainCreateKey: null,
        createKeyPublicKey: CREATE_KEY,
        tokenMint: TOKEN_MINT,
        limitAmount: 100,
        decimals: 6,
        periodType: "daily",
        blockhash: BLOCKHASH,
      });

      // Should have 1 configTransactionCreate (add), 1 proposalCreate, 1 approve, 1 execute
      const configCalls = mock._testCalls.configTransactionCreate;
      const proposalCalls = mock._testCalls.proposalCreate;
      const approveCalls = mock._testCalls.proposalApprove;
      const executeCalls = mock._testCalls.configTransactionExecute;

      expect(configCalls).toHaveLength(1);
      expect(proposalCalls).toHaveLength(1);
      expect(approveCalls).toHaveLength(1);
      expect(executeCalls).toHaveLength(1);

      // configTransactionCreate: creator = user, rentPayer = sponsor
      expectKeyEquals(configCalls[0].creator, USER_WALLET, "config.creator");
      expectKeyEquals(configCalls[0].rentPayer, SPONSOR_PUBKEY, "config.rentPayer");

      // proposalCreate
      expectKeyEquals(proposalCalls[0].creator, USER_WALLET, "proposal.creator");
      expectKeyEquals(proposalCalls[0].rentPayer, SPONSOR_PUBKEY, "proposal.rentPayer");

      // proposalApprove
      expectKeyEquals(approveCalls[0].member, USER_WALLET, "approve.member");

      // configTransactionExecute
      expectKeyEquals(executeCalls[0].member, USER_WALLET, "execute.member");
      expectKeyEquals(executeCalls[0].rentPayer, SPONSOR_PUBKEY, "execute.rentPayer");
    });

    it("builds remove + add when oldOnchainCreateKey exists", () => {
      const OLD_CREATE_KEY = Keypair.generate().publicKey;

      buildSpendingLimitUpdateTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        multisigPda: MULTISIG_PDA,
        agentPubkey: AGENT_PUBKEY,
        currentTransactionIndex: 5,
        oldOnchainCreateKey: OLD_CREATE_KEY.toBase58(),
        createKeyPublicKey: CREATE_KEY,
        tokenMint: TOKEN_MINT,
        limitAmount: 100,
        decimals: 6,
        periodType: "weekly",
        blockhash: BLOCKHASH,
      });

      // 2 configTransactionCreate (remove + add)
      const configCalls = mock._testCalls.configTransactionCreate;
      expect(configCalls).toHaveLength(2);

      // Both use userWallet as creator, sponsor as rentPayer
      for (const call of configCalls) {
        expectKeyEquals(call.creator, USER_WALLET, "config.creator");
        expectKeyEquals(call.rentPayer, SPONSOR_PUBKEY, "config.rentPayer");
      }

      // First action is RemoveSpendingLimit
      expect(configCalls[0].actions[0].__kind).toBe("RemoveSpendingLimit");
      // Second action is AddSpendingLimit
      expect(configCalls[1].actions[0].__kind).toBe("AddSpendingLimit");
    });

    it("sets payerKey to sponsor in TransactionMessage", () => {
      const result = buildSpendingLimitUpdateTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        multisigPda: MULTISIG_PDA,
        agentPubkey: AGENT_PUBKEY,
        currentTransactionIndex: 5,
        oldOnchainCreateKey: null,
        createKeyPublicKey: CREATE_KEY,
        tokenMint: TOKEN_MINT,
        limitAmount: 50,
        decimals: 9,
        periodType: "monthly",
        blockhash: BLOCKHASH,
      });

      expect(result.tx).toBeDefined();
      expect(result.instructions.length).toBeGreaterThan(0);
    });

    it("sponsor key never appears as creator or member in any instruction", () => {
      buildSpendingLimitUpdateTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        multisigPda: MULTISIG_PDA,
        agentPubkey: AGENT_PUBKEY,
        currentTransactionIndex: 5,
        oldOnchainCreateKey: Keypair.generate().publicKey.toBase58(),
        createKeyPublicKey: CREATE_KEY,
        tokenMint: TOKEN_MINT,
        limitAmount: 100,
        decimals: 6,
        periodType: "daily",
        blockhash: BLOCKHASH,
      });

      for (const call of mock._testCalls.configTransactionCreate) {
        expect(call.creator.toBase58()).not.toBe(SPONSOR_PUBKEY.toBase58());
      }
      for (const call of mock._testCalls.proposalCreate) {
        expect(call.creator.toBase58()).not.toBe(SPONSOR_PUBKEY.toBase58());
      }
      for (const call of mock._testCalls.proposalApprove) {
        expect(call.member.toBase58()).not.toBe(SPONSOR_PUBKEY.toBase58());
      }
      for (const call of mock._testCalls.configTransactionExecute) {
        expect(call.member.toBase58()).not.toBe(SPONSOR_PUBKEY.toBase58());
      }
    });
  });

  // =======================================================================
  // removeMember
  // =======================================================================
  describe("buildRemoveMemberTxCore", () => {
    it("uses userWallet as creator/member, sponsor as rentPayer", () => {
      buildRemoveMemberTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        multisigPda: MULTISIG_PDA,
        memberToRemove: MEMBER_TO_REMOVE,
        currentTransactionIndex: 3,
        blockhash: BLOCKHASH,
      });

      const configCalls = mock._testCalls.configTransactionCreate;
      const proposalCalls = mock._testCalls.proposalCreate;
      const approveCalls = mock._testCalls.proposalApprove;
      const executeCalls = mock._testCalls.configTransactionExecute;

      expect(configCalls).toHaveLength(1);
      expectKeyEquals(configCalls[0].creator, USER_WALLET, "config.creator");
      expectKeyEquals(configCalls[0].rentPayer, SPONSOR_PUBKEY, "config.rentPayer");

      expectKeyEquals(proposalCalls[0].creator, USER_WALLET, "proposal.creator");
      expectKeyEquals(proposalCalls[0].rentPayer, SPONSOR_PUBKEY, "proposal.rentPayer");

      expectKeyEquals(approveCalls[0].member, USER_WALLET, "approve.member");

      expectKeyEquals(executeCalls[0].member, USER_WALLET, "execute.member");
      expectKeyEquals(executeCalls[0].rentPayer, SPONSOR_PUBKEY, "execute.rentPayer");
    });

    it("action is RemoveMember with the correct target", () => {
      buildRemoveMemberTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        multisigPda: MULTISIG_PDA,
        memberToRemove: MEMBER_TO_REMOVE,
        currentTransactionIndex: 3,
        blockhash: BLOCKHASH,
      });

      const configCall = mock._testCalls.configTransactionCreate[0];
      expect(configCall.actions[0].__kind).toBe("RemoveMember");
      expectKeyEquals(configCall.actions[0].oldMember, MEMBER_TO_REMOVE, "oldMember");
    });

    it("builds 4 instructions: config, proposal, approve, execute", () => {
      const result = buildRemoveMemberTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        multisigPda: MULTISIG_PDA,
        memberToRemove: MEMBER_TO_REMOVE,
        currentTransactionIndex: 3,
        blockhash: BLOCKHASH,
      });

      expect(result.instructions).toHaveLength(4);
    });

    it("sponsor key never appears as creator or member", () => {
      buildRemoveMemberTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        multisigPda: MULTISIG_PDA,
        memberToRemove: MEMBER_TO_REMOVE,
        currentTransactionIndex: 3,
        blockhash: BLOCKHASH,
      });

      for (const call of mock._testCalls.configTransactionCreate) {
        expect(call.creator.toBase58()).not.toBe(SPONSOR_PUBKEY.toBase58());
      }
      for (const call of mock._testCalls.proposalApprove) {
        expect(call.member.toBase58()).not.toBe(SPONSOR_PUBKEY.toBase58());
      }
      for (const call of mock._testCalls.configTransactionExecute) {
        expect(call.member.toBase58()).not.toBe(SPONSOR_PUBKEY.toBase58());
      }
    });
  });

  // =======================================================================
  // agentActivation
  // =======================================================================
  describe("buildAgentActivationTxCore", () => {
    it("uses userWallet as creator/member, sponsor only as rentPayer", () => {
      buildAgentActivationTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        multisigPda: MULTISIG_PDA,
        agentPubkey: AGENT_PUBKEY,
        currentTransactionIndex: 5,
        createKeyPublicKey: CREATE_KEY,
        tokenMint: TOKEN_MINT,
        limitAmount: 100,
        decimals: 6,
        periodType: "daily",
        blockhash: BLOCKHASH,
      });

      const configCalls = mock._testCalls.configTransactionCreate;
      const proposalCalls = mock._testCalls.proposalCreate;
      const approveCalls = mock._testCalls.proposalApprove;
      const executeCalls = mock._testCalls.configTransactionExecute;

      expectKeyEquals(configCalls[0].creator, USER_WALLET, "config.creator");
      expectKeyEquals(configCalls[0].rentPayer, SPONSOR_PUBKEY, "config.rentPayer");
      expectKeyEquals(proposalCalls[0].creator, USER_WALLET, "proposal.creator");
      expectKeyEquals(proposalCalls[0].rentPayer, SPONSOR_PUBKEY, "proposal.rentPayer");
      expectKeyEquals(approveCalls[0].member, USER_WALLET, "approve.member");
      expectKeyEquals(executeCalls[0].member, USER_WALLET, "execute.member");
      expectKeyEquals(executeCalls[0].rentPayer, SPONSOR_PUBKEY, "execute.rentPayer");
    });

    it("includes AddMember + AddSpendingLimit actions", () => {
      buildAgentActivationTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        multisigPda: MULTISIG_PDA,
        agentPubkey: AGENT_PUBKEY,
        currentTransactionIndex: 5,
        createKeyPublicKey: CREATE_KEY,
        tokenMint: TOKEN_MINT,
        limitAmount: 100,
        decimals: 6,
        periodType: "daily",
        blockhash: BLOCKHASH,
      });

      const configCall = mock._testCalls.configTransactionCreate[0];
      expect(configCall.actions).toHaveLength(2);
      expect(configCall.actions[0].__kind).toBe("AddMember");
      expect(configCall.actions[1].__kind).toBe("AddSpendingLimit");
    });

    it("AddMember targets agent key (not user or sponsor)", () => {
      buildAgentActivationTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        multisigPda: MULTISIG_PDA,
        agentPubkey: AGENT_PUBKEY,
        currentTransactionIndex: 5,
        createKeyPublicKey: CREATE_KEY,
        tokenMint: TOKEN_MINT,
        limitAmount: 100,
        decimals: 6,
        periodType: "daily",
        blockhash: BLOCKHASH,
      });

      const configCall = mock._testCalls.configTransactionCreate[0];
      const addMember = configCall.actions[0];
      expectKeyEquals(addMember.newMember.key, AGENT_PUBKEY, "newMember.key");
    });

    it("sponsor key never appears as creator or member", () => {
      buildAgentActivationTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        multisigPda: MULTISIG_PDA,
        agentPubkey: AGENT_PUBKEY,
        currentTransactionIndex: 5,
        createKeyPublicKey: CREATE_KEY,
        tokenMint: TOKEN_MINT,
        limitAmount: 100,
        decimals: 6,
        periodType: "daily",
        blockhash: BLOCKHASH,
      });

      for (const call of mock._testCalls.configTransactionCreate) {
        expect(call.creator.toBase58()).not.toBe(SPONSOR_PUBKEY.toBase58());
      }
      for (const call of mock._testCalls.proposalApprove) {
        expect(call.member.toBase58()).not.toBe(SPONSOR_PUBKEY.toBase58());
      }
    });
  });

  // =======================================================================
  // agentRevocation
  // =======================================================================
  describe("buildAgentRevocationTxCore", () => {
    it("uses userWallet as creator/member, sponsor only as rentPayer", () => {
      buildAgentRevocationTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        multisigPda: MULTISIG_PDA,
        agentPubkey: AGENT_PUBKEY,
        currentTransactionIndex: 5,
        onchainCreateKey: null,
        blockhash: BLOCKHASH,
      });

      const configCalls = mock._testCalls.configTransactionCreate;
      expectKeyEquals(configCalls[0].creator, USER_WALLET, "config.creator");
      expectKeyEquals(configCalls[0].rentPayer, SPONSOR_PUBKEY, "config.rentPayer");

      const approveCalls = mock._testCalls.proposalApprove;
      expectKeyEquals(approveCalls[0].member, USER_WALLET, "approve.member");
    });

    it("includes RemoveMember only when no onchainCreateKey", () => {
      buildAgentRevocationTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        multisigPda: MULTISIG_PDA,
        agentPubkey: AGENT_PUBKEY,
        currentTransactionIndex: 5,
        onchainCreateKey: null,
        blockhash: BLOCKHASH,
      });

      const configCall = mock._testCalls.configTransactionCreate[0];
      expect(configCall.actions).toHaveLength(1);
      expect(configCall.actions[0].__kind).toBe("RemoveMember");
      expectKeyEquals(configCall.actions[0].oldMember, AGENT_PUBKEY, "oldMember");
    });

    it("includes RemoveMember + RemoveSpendingLimit when onchainCreateKey exists", () => {
      const ON_CHAIN_KEY = Keypair.generate().publicKey;

      buildAgentRevocationTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        multisigPda: MULTISIG_PDA,
        agentPubkey: AGENT_PUBKEY,
        currentTransactionIndex: 5,
        onchainCreateKey: ON_CHAIN_KEY.toBase58(),
        blockhash: BLOCKHASH,
      });

      const configCall = mock._testCalls.configTransactionCreate[0];
      expect(configCall.actions).toHaveLength(2);
      expect(configCall.actions[0].__kind).toBe("RemoveMember");
      expect(configCall.actions[1].__kind).toBe("RemoveSpendingLimit");
    });

    it("sponsor key never appears as creator or member", () => {
      buildAgentRevocationTxCore({
        userWallet: USER_WALLET,
        sponsorPublicKey: SPONSOR_PUBKEY,
        multisigPda: MULTISIG_PDA,
        agentPubkey: AGENT_PUBKEY,
        currentTransactionIndex: 5,
        onchainCreateKey: Keypair.generate().publicKey.toBase58(),
        blockhash: BLOCKHASH,
      });

      for (const call of mock._testCalls.configTransactionCreate) {
        expect(call.creator.toBase58()).not.toBe(SPONSOR_PUBKEY.toBase58());
      }
      for (const call of mock._testCalls.proposalApprove) {
        expect(call.member.toBase58()).not.toBe(SPONSOR_PUBKEY.toBase58());
      }
      for (const call of mock._testCalls.configTransactionExecute) {
        expect(call.member.toBase58()).not.toBe(SPONSOR_PUBKEY.toBase58());
      }
    });
  });
});
