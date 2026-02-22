import * as multisig from "@sqds/multisig";
import {
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import BN from "bn.js";

// ---------------------------------------------------------------------------
// createWorkspace
// ---------------------------------------------------------------------------

export interface BuildCreateWorkspaceParams {
  creatorWallet: PublicKey;
  sponsorPublicKey: PublicKey;
  walletMemberKeys: PublicKey[];
  createKeyPublicKey: PublicKey;
  multisigPda: PublicKey;
  treasury: PublicKey;
  blockhash: string;
}

export interface CreateWorkspaceResult {
  members: multisig.types.Member[];
  tx: VersionedTransaction;
}

export function buildCreateWorkspaceTxCore(
  params: BuildCreateWorkspaceParams,
): CreateWorkspaceResult {
  const members: multisig.types.Member[] = [
    { key: params.creatorWallet, permissions: multisig.types.Permissions.all() },
    ...params.walletMemberKeys.map((key) => ({
      key,
      permissions: multisig.types.Permissions.all(),
    })),
  ];

  const tx = multisig.transactions.multisigCreateV2({
    blockhash: params.blockhash,
    treasury: params.treasury,
    createKey: params.createKeyPublicKey,
    creator: params.creatorWallet,
    multisigPda: params.multisigPda,
    configAuthority: null,
    threshold: 1,
    members,
    timeLock: 0,
    rentCollector: null,
  });

  return { members, tx };
}

// ---------------------------------------------------------------------------
// spendingLimitUpdate
// ---------------------------------------------------------------------------

function mapPeriod(
  periodType: "daily" | "weekly" | "monthly",
): multisig.types.Period {
  switch (periodType) {
    case "daily":
      return multisig.types.Period.Day;
    case "weekly":
      return multisig.types.Period.Week;
    case "monthly":
      return multisig.types.Period.Month;
  }
}

export interface BuildSpendingLimitUpdateParams {
  userWallet: PublicKey;
  sponsorPublicKey: PublicKey;
  multisigPda: PublicKey;
  agentPubkey: PublicKey;
  currentTransactionIndex: number;
  oldOnchainCreateKey: string | null | undefined;
  createKeyPublicKey: PublicKey;
  tokenMint: PublicKey;
  limitAmount: number;
  decimals: number;
  periodType: "daily" | "weekly" | "monthly";
  blockhash: string;
}

export interface SpendingLimitUpdateResult {
  instructions: ReturnType<typeof multisig.instructions.configTransactionCreate>[];
  messageV0: ReturnType<TransactionMessage["compileToV0Message"]>;
  tx: VersionedTransaction;
}

export function buildSpendingLimitUpdateTxCore(
  params: BuildSpendingLimitUpdateParams,
): SpendingLimitUpdateResult {
  const allInstructions: ReturnType<typeof multisig.instructions.configTransactionCreate>[] = [];
  let currentTransactionIndex = params.currentTransactionIndex;

  // If there's an existing on-chain spending limit, remove it first
  if (params.oldOnchainCreateKey) {
    const oldCreateKeyPubkey = new PublicKey(params.oldOnchainCreateKey);
    const [oldSpendingLimitPda] = multisig.getSpendingLimitPda({
      multisigPda: params.multisigPda,
      createKey: oldCreateKeyPubkey,
    });

    const removeIndex = BigInt(currentTransactionIndex + 1);

    allInstructions.push(
      multisig.instructions.configTransactionCreate({
        multisigPda: params.multisigPda,
        transactionIndex: removeIndex,
        creator: params.userWallet,
        rentPayer: params.sponsorPublicKey,
        actions: [
          {
            __kind: "RemoveSpendingLimit",
            spendingLimit: oldSpendingLimitPda,
          },
        ],
      }),
      multisig.instructions.proposalCreate({
        multisigPda: params.multisigPda,
        transactionIndex: removeIndex,
        creator: params.userWallet,
        rentPayer: params.sponsorPublicKey,
      }),
      multisig.instructions.proposalApprove({
        multisigPda: params.multisigPda,
        transactionIndex: removeIndex,
        member: params.userWallet,
      }),
      multisig.instructions.configTransactionExecute({
        multisigPda: params.multisigPda,
        transactionIndex: removeIndex,
        member: params.userWallet,
        rentPayer: params.sponsorPublicKey,
        spendingLimits: [oldSpendingLimitPda],
      }),
    );

    currentTransactionIndex++;
  }

  // Add new spending limit
  const [spendingLimitPda] = multisig.getSpendingLimitPda({
    multisigPda: params.multisigPda,
    createKey: params.createKeyPublicKey,
  });

  const period = mapPeriod(params.periodType);
  const amount = new BN(Math.round(params.limitAmount * 10 ** params.decimals));
  const addIndex = BigInt(currentTransactionIndex + 1);

  allInstructions.push(
    multisig.instructions.configTransactionCreate({
      multisigPda: params.multisigPda,
      transactionIndex: addIndex,
      creator: params.userWallet,
      rentPayer: params.sponsorPublicKey,
      actions: [
        {
          __kind: "AddSpendingLimit",
          createKey: params.createKeyPublicKey,
          vaultIndex: 0,
          mint: params.tokenMint,
          amount,
          period,
          members: [params.agentPubkey],
          destinations: [],
        },
      ],
    }),
    multisig.instructions.proposalCreate({
      multisigPda: params.multisigPda,
      transactionIndex: addIndex,
      creator: params.userWallet,
      rentPayer: params.sponsorPublicKey,
    }),
    multisig.instructions.proposalApprove({
      multisigPda: params.multisigPda,
      transactionIndex: addIndex,
      member: params.userWallet,
    }),
    multisig.instructions.configTransactionExecute({
      multisigPda: params.multisigPda,
      transactionIndex: addIndex,
      member: params.userWallet,
      rentPayer: params.sponsorPublicKey,
      spendingLimits: [spendingLimitPda],
    }),
  );

  const messageV0 = new TransactionMessage({
    payerKey: params.sponsorPublicKey,
    recentBlockhash: params.blockhash,
    instructions: allInstructions,
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);

  return { instructions: allInstructions, messageV0, tx };
}

// ---------------------------------------------------------------------------
// removeMember
// ---------------------------------------------------------------------------

export interface BuildRemoveMemberParams {
  userWallet: PublicKey;
  sponsorPublicKey: PublicKey;
  multisigPda: PublicKey;
  memberToRemove: PublicKey;
  currentTransactionIndex: number;
  blockhash: string;
}

export interface RemoveMemberResult {
  instructions: ReturnType<typeof multisig.instructions.configTransactionCreate>[];
  messageV0: ReturnType<TransactionMessage["compileToV0Message"]>;
  tx: VersionedTransaction;
}

export function buildRemoveMemberTxCore(
  params: BuildRemoveMemberParams,
): RemoveMemberResult {
  const newTransactionIndex = BigInt(params.currentTransactionIndex + 1);

  const removeIx = multisig.instructions.configTransactionCreate({
    multisigPda: params.multisigPda,
    transactionIndex: newTransactionIndex,
    creator: params.userWallet,
    rentPayer: params.sponsorPublicKey,
    actions: [
      { __kind: "RemoveMember", oldMember: params.memberToRemove },
    ],
  });

  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda: params.multisigPda,
    transactionIndex: newTransactionIndex,
    creator: params.userWallet,
    rentPayer: params.sponsorPublicKey,
  });

  const approveIx = multisig.instructions.proposalApprove({
    multisigPda: params.multisigPda,
    transactionIndex: newTransactionIndex,
    member: params.userWallet,
  });

  const executeIx = multisig.instructions.configTransactionExecute({
    multisigPda: params.multisigPda,
    transactionIndex: newTransactionIndex,
    member: params.userWallet,
    rentPayer: params.sponsorPublicKey,
    spendingLimits: [],
  });

  const instructions = [removeIx, proposalIx, approveIx, executeIx];

  const messageV0 = new TransactionMessage({
    payerKey: params.sponsorPublicKey,
    recentBlockhash: params.blockhash,
    instructions,
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);

  return { instructions, messageV0, tx };
}

// ---------------------------------------------------------------------------
// agentActivation
// ---------------------------------------------------------------------------

export interface BuildAgentActivationParams {
  userWallet: PublicKey;
  sponsorPublicKey: PublicKey;
  multisigPda: PublicKey;
  agentPubkey: PublicKey;
  currentTransactionIndex: number;
  createKeyPublicKey: PublicKey;
  tokenMint: PublicKey;
  limitAmount: number;
  decimals: number;
  periodType: "daily" | "weekly" | "monthly";
  blockhash: string;
}

export interface AgentActivationResult {
  instructions: ReturnType<typeof multisig.instructions.configTransactionCreate>[];
  messageV0: ReturnType<TransactionMessage["compileToV0Message"]>;
  tx: VersionedTransaction;
}

export function buildAgentActivationTxCore(
  params: BuildAgentActivationParams,
): AgentActivationResult {
  const transactionIndex = BigInt(params.currentTransactionIndex + 1);

  const [spendingLimitPda] = multisig.getSpendingLimitPda({
    multisigPda: params.multisigPda,
    createKey: params.createKeyPublicKey,
  });

  const period = mapPeriod(params.periodType);
  const amount = new BN(Math.round(params.limitAmount * 10 ** params.decimals));

  const configIx = multisig.instructions.configTransactionCreate({
    multisigPda: params.multisigPda,
    transactionIndex,
    creator: params.userWallet,
    rentPayer: params.sponsorPublicKey,
    actions: [
      {
        __kind: "AddMember",
        newMember: {
          key: params.agentPubkey,
          permissions: multisig.types.Permissions.fromPermissions([
            multisig.types.Permission.Initiate,
          ]),
        },
      },
      {
        __kind: "AddSpendingLimit",
        createKey: params.createKeyPublicKey,
        vaultIndex: 0,
        mint: params.tokenMint,
        amount,
        period,
        members: [params.agentPubkey],
        destinations: [],
      },
    ],
  });

  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda: params.multisigPda,
    transactionIndex,
    creator: params.userWallet,
    rentPayer: params.sponsorPublicKey,
  });

  const approveIx = multisig.instructions.proposalApprove({
    multisigPda: params.multisigPda,
    transactionIndex,
    member: params.userWallet,
  });

  const executeIx = multisig.instructions.configTransactionExecute({
    multisigPda: params.multisigPda,
    transactionIndex,
    member: params.userWallet,
    rentPayer: params.sponsorPublicKey,
    spendingLimits: [spendingLimitPda],
  });

  const instructions = [configIx, proposalIx, approveIx, executeIx];

  const messageV0 = new TransactionMessage({
    payerKey: params.sponsorPublicKey,
    recentBlockhash: params.blockhash,
    instructions,
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);

  return { instructions, messageV0, tx };
}

// ---------------------------------------------------------------------------
// agentRevocation
// ---------------------------------------------------------------------------

export interface BuildAgentRevocationParams {
  userWallet: PublicKey;
  sponsorPublicKey: PublicKey;
  multisigPda: PublicKey;
  agentPubkey: PublicKey;
  currentTransactionIndex: number;
  onchainCreateKey: string | null | undefined;
  blockhash: string;
}

export interface AgentRevocationResult {
  instructions: ReturnType<typeof multisig.instructions.configTransactionCreate>[];
  messageV0: ReturnType<TransactionMessage["compileToV0Message"]>;
  tx: VersionedTransaction;
}

export function buildAgentRevocationTxCore(
  params: BuildAgentRevocationParams,
): AgentRevocationResult {
  const transactionIndex = BigInt(params.currentTransactionIndex + 1);

  const actions: Parameters<
    typeof multisig.instructions.configTransactionCreate
  >[0]["actions"] = [
    { __kind: "RemoveMember", oldMember: params.agentPubkey },
  ];

  let spendingLimitPda: PublicKey | undefined;

  if (params.onchainCreateKey) {
    const onchainCreateKeyPubkey = new PublicKey(params.onchainCreateKey);
    [spendingLimitPda] = multisig.getSpendingLimitPda({
      multisigPda: params.multisigPda,
      createKey: onchainCreateKeyPubkey,
    });
    actions.push({
      __kind: "RemoveSpendingLimit",
      spendingLimit: spendingLimitPda,
    });
  }

  const configIx = multisig.instructions.configTransactionCreate({
    multisigPda: params.multisigPda,
    transactionIndex,
    creator: params.userWallet,
    rentPayer: params.sponsorPublicKey,
    actions,
  });

  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda: params.multisigPda,
    transactionIndex,
    creator: params.userWallet,
    rentPayer: params.sponsorPublicKey,
  });

  const approveIx = multisig.instructions.proposalApprove({
    multisigPda: params.multisigPda,
    transactionIndex,
    member: params.userWallet,
  });

  const executeIx = multisig.instructions.configTransactionExecute({
    multisigPda: params.multisigPda,
    transactionIndex,
    member: params.userWallet,
    rentPayer: params.sponsorPublicKey,
    spendingLimits: spendingLimitPda ? [spendingLimitPda] : [],
  });

  const instructions = [configIx, proposalIx, approveIx, executeIx];

  const messageV0 = new TransactionMessage({
    payerKey: params.sponsorPublicKey,
    recentBlockhash: params.blockhash,
    instructions,
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);

  return { instructions, messageV0, tx };
}
