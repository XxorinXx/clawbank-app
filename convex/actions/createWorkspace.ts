"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import * as multisig from "@sqds/multisig";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getSponsorKey } from "../env";

const RATE_LIMIT_MS = 30_000;
const MAINNET_RPC = "https://api.mainnet-beta.solana.com";

export const createWorkspace = action({
  args: {
    name: v.string(),
    members: v.array(
      v.object({
        type: v.union(v.literal("email"), v.literal("wallet")),
        value: v.string(),
      }),
    ),
  },
  handler: async (ctx, args): Promise<{ workspaceId: string; multisigAddress: string; vaultAddress: string }> => {
    // Auth check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    // Validate name
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

    // Separate wallet and email members
    const walletMembers = args.members.filter((m) => m.type === "wallet");
    const emailMembers = args.members.filter((m) => m.type === "email");

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

    // Get sponsor key from validated env - NEVER log or return this value
    const sponsorKeypair = Keypair.fromSecretKey(getSponsorKey());

    // Create Squads multisig on mainnet
    const connection = new Connection(MAINNET_RPC, "confirmed");
    const createKey = Keypair.generate();
    const [multisigPda] = multisig.getMultisigPda({
      createKey: createKey.publicKey,
    });

    // Build multisig members: creator + wallet-type members
    const msMembers: multisig.types.Member[] = [
      {
        key: creatorWallet,
        permissions: multisig.types.Permissions.all(),
      },
      ...walletMembers.map((wm) => ({
        key: new PublicKey(wm.value),
        permissions: multisig.types.Permissions.all(),
      })),
    ];

    // Squads protocol fee treasury (from on-chain program config)
    const [programConfigPda] = multisig.getProgramConfigPda({});
    const programConfigInfo = await connection.getAccountInfo(programConfigPda);
    if (!programConfigInfo) {
      throw new Error("Squads program config not found on-chain");
    }
    const [programConfig] = multisig.accounts.ProgramConfig.fromAccountInfo(
      programConfigInfo,
    );
    const protocolTreasury = programConfig.treasury;

    // Get blockhash for transaction
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();

    // Build the multisig create transaction
    const tx = multisig.transactions.multisigCreateV2({
      blockhash,
      treasury: protocolTreasury,
      createKey: createKey.publicKey,
      creator: sponsorKeypair.publicKey,
      multisigPda,
      configAuthority: null,
      threshold: 1,
      members: msMembers,
      timeLock: 0,
      rentCollector: null,
    });

    // Sign with sponsor (payer) and createKey
    tx.sign([sponsorKeypair, createKey]);

    // Send and confirm the transaction
    let signature: string;
    try {
      signature = await connection.sendTransaction(tx, { skipPreflight: false });
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

    const multisigAddress = multisigPda.toBase58();
    const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
    const vaultAddress = vaultPda.toBase58();
    const now = Date.now();

    // Store workspace, members, and invites in Convex
    const workspaceId = await ctx.runMutation(
      internal.internals.workspaceHelpers.storeWorkspace,
      {
        name: trimmedName,
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
