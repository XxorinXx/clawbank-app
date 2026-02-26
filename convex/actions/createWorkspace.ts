"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import * as smartAccount from "@sqds/smart-account";
import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import { getSponsorKey, getRpcUrl } from "../env";
import { buildCreateWorkspaceTxCore } from "../lib/txBuilders";
import { extractErrorMessage } from "../lib/turnkeyHelpers";

const RATE_LIMIT_MS = 30_000;

export const buildCreateWorkspaceTx = action({
  args: {
    name: v.string(),
    members: v.array(
      v.object({
        type: v.union(v.literal("email"), v.literal("wallet")),
        value: v.string(),
      }),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ serializedTx: string; settingsAddress: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const trimmedName = args.name.trim();
    if (trimmedName.length === 0) {
      throw new Error("Workspace name cannot be empty");
    }

    // Rate limit check
    const lastCreation = await ctx.runQuery(
      internal.internals.workspaceHelpers.getLastCreationTime,
      { creatorTokenIdentifier: identity.tokenIdentifier },
    );
    if (lastCreation !== null && Date.now() - lastCreation < RATE_LIMIT_MS) {
      throw new Error(
        "Rate limited: please wait 30 seconds between workspace creations",
      );
    }

    const walletMembers = args.members.filter((m) => m.type === "wallet");

    // Validate wallet addresses
    for (const wm of walletMembers) {
      try {
        new PublicKey(wm.value);
      } catch {
        throw new Error(`Invalid wallet address: ${wm.value}`);
      }
    }

    // Get creator's wallet from DB
    const user = await ctx.runQuery(
      internal.internals.workspaceHelpers.getUserByToken,
      { tokenIdentifier: identity.tokenIdentifier },
    );
    if (!user) {
      throw new Error("User not found - please complete registration first");
    }

    const creatorWallet = new PublicKey(user.walletAddress);
    const sponsorKeypair = Keypair.fromSecretKey(getSponsorKey());

    const connection = new Connection(getRpcUrl(), "confirmed");

    // Read ProgramConfig to get the next smart account index
    const [programConfigPda] = smartAccount.getProgramConfigPda({});
    const programConfigInfo = await connection.getAccountInfo(programConfigPda);
    if (!programConfigInfo) {
      throw new Error("Smart Account program config not found on-chain");
    }
    const [programConfig] =
      smartAccount.accounts.ProgramConfig.fromAccountInfo(programConfigInfo);
    const protocolTreasury = programConfig.treasury;
    const nextAccountIndex = BigInt(
      programConfig.smartAccountIndex.toString(),
    );

    // Derive the settings PDA from the next account index
    const [settingsPda] = smartAccount.getSettingsPda({
      accountIndex: nextAccountIndex,
    });

    const { blockhash } = await connection.getLatestBlockhash();

    const { tx } = buildCreateWorkspaceTxCore({
      creatorWallet,
      sponsorPublicKey: sponsorKeypair.publicKey,
      walletMemberKeys: walletMembers.map((wm) => new PublicKey(wm.value)),
      settingsPda,
      treasury: protocolTreasury,
      blockhash,
    });

    // Partial-sign with sponsor (fee payer)
    // User signs on frontend with Privy wallet
    tx.sign([sponsorKeypair]);

    const serializedTx = Buffer.from(tx.serialize()).toString("base64");

    return {
      serializedTx,
      settingsAddress: settingsPda.toBase58(),
    };
  },
});

export const submitCreateWorkspaceTx = action({
  args: {
    name: v.string(),
    members: v.array(
      v.object({
        type: v.union(v.literal("email"), v.literal("wallet")),
        value: v.string(),
      }),
    ),
    signedTx: v.string(),
    settingsAddress: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ workspaceId: string; settingsAddress: string; vaultAddress: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    // Get creator's wallet
    const user = await ctx.runQuery(
      internal.internals.workspaceHelpers.getUserByToken,
      { tokenIdentifier: identity.tokenIdentifier },
    );
    if (!user) throw new Error("User not found");

    const creatorWallet = new PublicKey(user.walletAddress);

    const connection = new Connection(getRpcUrl(), "confirmed");

    const txBytes = Buffer.from(args.signedTx, "base64");
    const tx = VersionedTransaction.deserialize(txBytes);

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    let signature: string;
    try {
      signature = await connection.sendTransaction(tx, {
        skipPreflight: false,
      });
    } catch (err: unknown) {
      throw new Error(`Failed to create smart account on Solana: ${extractErrorMessage(err, "Unknown Solana error")}`);
    }

    try {
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
    } catch (err: unknown) {
      throw new Error(`Smart account transaction failed to confirm: ${extractErrorMessage(err, "Unknown confirmation error")}`);
    }

    // On-chain confirmed — now store in DB
    const settingsPda = new PublicKey(args.settingsAddress);
    const settingsAddress = settingsPda.toBase58();
    const [vaultPda] = smartAccount.getSmartAccountPda({
      settingsPda,
      accountIndex: 0,
    });
    const vaultAddress = vaultPda.toBase58();

    const walletMembers = args.members.filter((m) => m.type === "wallet");
    const emailMembers = args.members.filter((m) => m.type === "email");
    const now = Date.now();

    const workspaceId = await ctx.runMutation(
      internal.internals.workspaceHelpers.storeWorkspace,
      {
        name: args.name.trim(),
        settingsAddress,
        vaultAddress,
        creatorTokenIdentifier: identity.tokenIdentifier,
        createdAt: now,
        members: [
          {
            walletAddress: creatorWallet.toBase58(),
            role: "creator" as const,
          },
          ...walletMembers.map((wm) => ({
            walletAddress: wm.value,
            role: "member" as const,
          })),
        ],
        invites: emailMembers.map((em) => ({
          email: em.value,
        })),
      },
    );

    return { workspaceId, settingsAddress, vaultAddress };
  },
});
