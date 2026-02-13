"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import * as multisig from "@sqds/multisig";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { getSponsorKey, getRpcUrl } from "../env";
import BN from "bn.js";

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

export const updateSpendingLimitOnchain = internalAction({
  args: {
    agentId: v.id("agents"),
    workspaceId: v.id("workspaces"),
    tokenMint: v.string(),
    limitAmount: v.number(),
    periodType: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
    ),
    userWalletAddress: v.string(),
    oldOnchainCreateKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    // Get workspace for multisig address
    const workspace = await ctx.runQuery(
      internal.internals.workspaceHelpers.getWorkspaceById,
      { workspaceId: args.workspaceId },
    );
    if (!workspace) throw new Error("Workspace not found");

    // Get agent for public key
    const agent = await ctx.runQuery(
      internal.internals.agentHelpers.getAgentById,
      { agentId: args.agentId },
    );
    if (!agent || !agent.publicKey) {
      throw new Error("Agent not found or not provisioned");
    }

    // Get token decimals from cache
    const tokenMeta = await ctx.runQuery(
      internal.internals.agentHelpers.getTokenMetadata,
      { mint: args.tokenMint },
    );
    const decimals = tokenMeta?.decimals ?? 9;

    const connection = new Connection(getRpcUrl(), "confirmed");
    const multisigPda = new PublicKey(workspace.multisigAddress);
    const sponsorKeypair = Keypair.fromSecretKey(getSponsorKey());
    const creatorKey = new PublicKey(args.userWalletAddress);
    const agentPubkey = new PublicKey(agent.publicKey);

    // Read multisig to get current transaction index
    const multisigAccount =
      await multisig.accounts.Multisig.fromAccountAddress(
        connection,
        multisigPda,
      );

    let currentTransactionIndex = Number(multisigAccount.transactionIndex);

    // If there's an existing on-chain spending limit, remove it first
    if (args.oldOnchainCreateKey) {
      const oldCreateKeyPubkey = new PublicKey(args.oldOnchainCreateKey);
      const [oldSpendingLimitPda] = multisig.getSpendingLimitPda({
        multisigPda,
        createKey: oldCreateKeyPubkey,
      });

      const removeIndex = BigInt(currentTransactionIndex + 1);

      const removeConfigIx = multisig.instructions.configTransactionCreate({
        multisigPda,
        transactionIndex: removeIndex,
        creator: creatorKey,
        rentPayer: sponsorKeypair.publicKey,
        actions: [
          {
            __kind: "RemoveSpendingLimit",
            spendingLimit: oldSpendingLimitPda,
          },
        ],
      });

      const removeProposalIx = multisig.instructions.proposalCreate({
        multisigPda,
        transactionIndex: removeIndex,
        creator: creatorKey,
        rentPayer: sponsorKeypair.publicKey,
      });

      const removeApproveIx = multisig.instructions.proposalApprove({
        multisigPda,
        transactionIndex: removeIndex,
        member: creatorKey,
      });

      const removeExecuteIx = multisig.instructions.configTransactionExecute({
        multisigPda,
        transactionIndex: removeIndex,
        member: creatorKey,
        rentPayer: sponsorKeypair.publicKey,
        spendingLimits: [oldSpendingLimitPda],
      });

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();

      const messageV0 = new TransactionMessage({
        payerKey: sponsorKeypair.publicKey,
        recentBlockhash: blockhash,
        instructions: [
          removeConfigIx,
          removeProposalIx,
          removeApproveIx,
          removeExecuteIx,
        ],
      }).compileToV0Message();

      const tx = new VersionedTransaction(messageV0);
      tx.sign([sponsorKeypair]);

      const removeSig = await connection.sendTransaction(tx, {
        skipPreflight: false,
      });
      await connection.confirmTransaction(
        {
          signature: removeSig,
          blockhash,
          lastValidBlockHeight,
        },
        "confirmed",
      );

      currentTransactionIndex++;
    }

    // Add new spending limit
    const createKey = Keypair.generate();
    const [spendingLimitPda] = multisig.getSpendingLimitPda({
      multisigPda,
      createKey: createKey.publicKey,
    });

    const period = mapPeriod(args.periodType);
    const amount = new BN(Math.round(args.limitAmount * 10 ** decimals));
    const addIndex = BigInt(currentTransactionIndex + 1);

    const addConfigIx = multisig.instructions.configTransactionCreate({
      multisigPda,
      transactionIndex: addIndex,
      creator: creatorKey,
      rentPayer: sponsorKeypair.publicKey,
      actions: [
        {
          __kind: "AddSpendingLimit",
          createKey: createKey.publicKey,
          vaultIndex: 0,
          mint: new PublicKey(args.tokenMint),
          amount,
          period,
          members: [agentPubkey],
          destinations: [],
        },
      ],
    });

    const addProposalIx = multisig.instructions.proposalCreate({
      multisigPda,
      transactionIndex: addIndex,
      creator: creatorKey,
      rentPayer: sponsorKeypair.publicKey,
    });

    const addApproveIx = multisig.instructions.proposalApprove({
      multisigPda,
      transactionIndex: addIndex,
      member: creatorKey,
    });

    const addExecuteIx = multisig.instructions.configTransactionExecute({
      multisigPda,
      transactionIndex: addIndex,
      member: creatorKey,
      rentPayer: sponsorKeypair.publicKey,
      spendingLimits: [spendingLimitPda],
    });

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
      payerKey: sponsorKeypair.publicKey,
      recentBlockhash: blockhash,
      instructions: [addConfigIx, addProposalIx, addApproveIx, addExecuteIx],
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([sponsorKeypair]);

    let signature: string;
    try {
      signature = await connection.sendTransaction(tx, {
        skipPreflight: false,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown Solana error";
      throw new Error(`Failed to update spending limit on-chain: ${message}`);
    }

    try {
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown confirmation error";
      throw new Error(
        `Spending limit transaction failed to confirm: ${message}`,
      );
    }

    // Update DB with new on-chain createKey
    await ctx.runMutation(
      internal.internals.agentHelpers.updateSpendingLimitOnchainKey,
      {
        agentId: args.agentId,
        workspaceId: args.workspaceId,
        onchainCreateKey: createKey.publicKey.toBase58(),
      },
    );

    // Log activity with tx signature
    await ctx.runMutation(internal.internals.agentHelpers.logActivity, {
      workspaceId: args.workspaceId,
      agentId: args.agentId,
      action: "limit_updated_onchain",
      txSignature: signature,
    });
  },
});
