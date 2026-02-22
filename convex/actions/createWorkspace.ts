"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import * as multisig from "@sqds/multisig";
import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import { getSponsorKey, getRpcUrl } from "../env";
import { buildCreateWorkspaceTxCore } from "../lib/txBuilders";

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
  ): Promise<{ serializedTx: string; createKey: string }> => {
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
    const createKey = Keypair.generate();
    const [multisigPda] = multisig.getMultisigPda({
      createKey: createKey.publicKey,
    });

    // Squads protocol fee treasury
    const [programConfigPda] = multisig.getProgramConfigPda({});
    const programConfigInfo = await connection.getAccountInfo(programConfigPda);
    if (!programConfigInfo) {
      throw new Error("Squads program config not found on-chain");
    }
    const [programConfig] = multisig.accounts.ProgramConfig.fromAccountInfo(
      programConfigInfo,
    );
    const protocolTreasury = programConfig.treasury;

    const { blockhash } = await connection.getLatestBlockhash();

    const { tx } = buildCreateWorkspaceTxCore({
      creatorWallet,
      sponsorPublicKey: sponsorKeypair.publicKey,
      walletMemberKeys: walletMembers.map((wm) => new PublicKey(wm.value)),
      createKeyPublicKey: createKey.publicKey,
      multisigPda,
      treasury: protocolTreasury,
      blockhash,
    });

    // Partial-sign with sponsor (fee payer) and createKey (ephemeral)
    // User signs on frontend with Privy wallet
    tx.sign([sponsorKeypair, createKey]);

    const serializedTx = Buffer.from(tx.serialize()).toString("base64");

    return {
      serializedTx,
      createKey: createKey.publicKey.toBase58(),
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
    createKey: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ workspaceId: string; multisigAddress: string; vaultAddress: string }> => {
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
    const { VersionedTransaction } = await import("@solana/web3.js");
    const tx = VersionedTransaction.deserialize(txBytes);

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    let signature: string;
    try {
      signature = await connection.sendTransaction(tx, {
        skipPreflight: false,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown Solana error";
      throw new Error(`Failed to create multisig on Solana: ${message}`);
    }

    try {
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown confirmation error";
      throw new Error(`Multisig transaction failed to confirm: ${message}`);
    }

    // On-chain confirmed — now store in DB
    const createKeyPubkey = new PublicKey(args.createKey);
    const [multisigPda] = multisig.getMultisigPda({
      createKey: createKeyPubkey,
    });
    const multisigAddress = multisigPda.toBase58();
    const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
    const vaultAddress = vaultPda.toBase58();

    const walletMembers = args.members.filter((m) => m.type === "wallet");
    const emailMembers = args.members.filter((m) => m.type === "email");
    const now = Date.now();

    const workspaceId = await ctx.runMutation(
      internal.internals.workspaceHelpers.storeWorkspace,
      {
        name: args.name.trim(),
        multisigAddress,
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

    return { workspaceId, multisigAddress, vaultAddress };
  },
});
