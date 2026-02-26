import * as smartAccount from "@sqds/smart-account";
import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

// ---------------------------------------------------------------------------
// createWorkspace
// ---------------------------------------------------------------------------

export interface BuildCreateWorkspaceParams {
  creatorWallet: PublicKey;
  sponsorPublicKey: PublicKey;
  walletMemberKeys: PublicKey[];
  settingsPda?: PublicKey;
  treasury: PublicKey;
  blockhash: string;
}

export interface CreateWorkspaceResult {
  signers: smartAccount.types.SmartAccountSigner[];
  tx: VersionedTransaction;
}

export function buildCreateWorkspaceTxCore(
  params: BuildCreateWorkspaceParams,
): CreateWorkspaceResult {
  const signers: smartAccount.types.SmartAccountSigner[] = [
    { key: params.creatorWallet, permissions: smartAccount.types.Permissions.all() },
    ...params.walletMemberKeys.map((key) => ({
      key,
      permissions: smartAccount.types.Permissions.all(),
    })),
  ];

  // Use instruction (not transaction) so we control the fee payer (sponsor)
  const createIx = smartAccount.instructions.createSmartAccount({
    treasury: params.treasury,
    creator: params.creatorWallet,
    settings: params.settingsPda,
    settingsAuthority: params.creatorWallet,
    threshold: 1,
    signers,
    timeLock: 0,
    rentCollector: null,
  });

  const messageV0 = new TransactionMessage({
    payerKey: params.sponsorPublicKey,
    recentBlockhash: params.blockhash,
    instructions: [createIx],
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);

  return { signers, tx };
}

// ---------------------------------------------------------------------------
// spendingLimitUpdate
// ---------------------------------------------------------------------------

function mapPeriod(
  periodType: "daily" | "weekly" | "monthly",
): smartAccount.types.Period {
  switch (periodType) {
    case "daily":
      return smartAccount.types.Period.Day;
    case "weekly":
      return smartAccount.types.Period.Week;
    case "monthly":
      return smartAccount.types.Period.Month;
  }
}

export interface BuildSpendingLimitUpdateParams {
  userWallet: PublicKey;
  sponsorPublicKey: PublicKey;
  settingsPda: PublicKey;
  agentPubkey: PublicKey;
  oldSeed: string | null | undefined;
  seed: PublicKey;
  tokenMint: PublicKey;
  limitAmount: number;
  decimals: number;
  periodType: "daily" | "weekly" | "monthly";
  blockhash: string;
}

export interface SpendingLimitUpdateResult {
  instructions: TransactionInstruction[];
  messageV0: ReturnType<TransactionMessage["compileToV0Message"]>;
  tx: VersionedTransaction;
}

export function buildSpendingLimitUpdateTxCore(
  params: BuildSpendingLimitUpdateParams,
): SpendingLimitUpdateResult {
  const allInstructions: TransactionInstruction[] = [];

  // If there's an existing on-chain spending limit, remove it first
  if (params.oldSeed) {
    const oldSeedPubkey = new PublicKey(params.oldSeed);
    const [oldSpendingLimitPda] = smartAccount.getSpendingLimitPda({
      settingsPda: params.settingsPda,
      seed: oldSeedPubkey,
    });

    allInstructions.push(
      smartAccount.instructions.removeSpendingLimitAsAuthority({
        settingsPda: params.settingsPda,
        settingsAuthority: params.userWallet,
        spendingLimit: oldSpendingLimitPda,
        rentCollector: params.sponsorPublicKey,
      }),
    );
  }

  // Add new spending limit
  const [spendingLimitPda] = smartAccount.getSpendingLimitPda({
    settingsPda: params.settingsPda,
    seed: params.seed,
  });

  const period = mapPeriod(params.periodType);
  const amount = BigInt(Math.round(params.limitAmount * 10 ** params.decimals));

  allInstructions.push(
    smartAccount.instructions.addSpendingLimitAsAuthority({
      settingsPda: params.settingsPda,
      settingsAuthority: params.userWallet,
      spendingLimit: spendingLimitPda,
      rentPayer: params.sponsorPublicKey,
      seed: params.seed,
      accountIndex: 0,
      mint: params.tokenMint,
      amount,
      period,
      signers: [params.agentPubkey],
      destinations: [],
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
  settingsPda: PublicKey;
  memberToRemove: PublicKey;
  blockhash: string;
}

export interface RemoveMemberResult {
  instructions: TransactionInstruction[];
  messageV0: ReturnType<TransactionMessage["compileToV0Message"]>;
  tx: VersionedTransaction;
}

export function buildRemoveMemberTxCore(
  params: BuildRemoveMemberParams,
): RemoveMemberResult {
  const removeIx = smartAccount.instructions.removeSignerAsAuthority({
    settingsPda: params.settingsPda,
    settingsAuthority: params.userWallet,
    oldSigner: params.memberToRemove,
  });

  const instructions = [removeIx];

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
  settingsPda: PublicKey;
  agentPubkey: PublicKey;
  seed: PublicKey;
  tokenMint: PublicKey;
  limitAmount: number;
  decimals: number;
  periodType: "daily" | "weekly" | "monthly";
  blockhash: string;
}

export interface AgentActivationResult {
  instructions: TransactionInstruction[];
  messageV0: ReturnType<TransactionMessage["compileToV0Message"]>;
  tx: VersionedTransaction;
}

export function buildAgentActivationTxCore(
  params: BuildAgentActivationParams,
): AgentActivationResult {
  const [spendingLimitPda] = smartAccount.getSpendingLimitPda({
    settingsPda: params.settingsPda,
    seed: params.seed,
  });

  const period = mapPeriod(params.periodType);
  const amount = BigInt(Math.round(params.limitAmount * 10 ** params.decimals));

  const addSignerIx = smartAccount.instructions.addSignerAsAuthority({
    settingsPda: params.settingsPda,
    settingsAuthority: params.userWallet,
    rentPayer: params.sponsorPublicKey,
    newSigner: {
      key: params.agentPubkey,
      permissions: smartAccount.types.Permissions.fromPermissions([
        smartAccount.types.Permission.Initiate,
      ]),
    },
  });

  const addSpendingLimitIx = smartAccount.instructions.addSpendingLimitAsAuthority({
    settingsPda: params.settingsPda,
    settingsAuthority: params.userWallet,
    spendingLimit: spendingLimitPda,
    rentPayer: params.sponsorPublicKey,
    seed: params.seed,
    accountIndex: 0,
    mint: params.tokenMint,
    amount,
    period,
    signers: [params.agentPubkey],
    destinations: [],
  });

  const instructions = [addSignerIx, addSpendingLimitIx];

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
  settingsPda: PublicKey;
  agentPubkey: PublicKey;
  oldSeed: string | null | undefined;
  blockhash: string;
}

export interface AgentRevocationResult {
  instructions: TransactionInstruction[];
  messageV0: ReturnType<TransactionMessage["compileToV0Message"]>;
  tx: VersionedTransaction;
}

export function buildAgentRevocationTxCore(
  params: BuildAgentRevocationParams,
): AgentRevocationResult {
  const instructions: TransactionInstruction[] = [];

  instructions.push(
    smartAccount.instructions.removeSignerAsAuthority({
      settingsPda: params.settingsPda,
      settingsAuthority: params.userWallet,
      oldSigner: params.agentPubkey,
    }),
  );

  if (params.oldSeed) {
    const seedPubkey = new PublicKey(params.oldSeed);
    const [spendingLimitPda] = smartAccount.getSpendingLimitPda({
      settingsPda: params.settingsPda,
      seed: seedPubkey,
    });

    instructions.push(
      smartAccount.instructions.removeSpendingLimitAsAuthority({
        settingsPda: params.settingsPda,
        settingsAuthority: params.userWallet,
        spendingLimit: spendingLimitPda,
        rentCollector: params.sponsorPublicKey,
      }),
    );
  }

  const messageV0 = new TransactionMessage({
    payerKey: params.sponsorPublicKey,
    recentBlockhash: params.blockhash,
    instructions,
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);

  return { instructions, messageV0, tx };
}
