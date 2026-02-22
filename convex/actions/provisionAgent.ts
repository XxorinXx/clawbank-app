"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Turnkey } from "@turnkey/sdk-server";
import {
  getTurnkeyApiPublicKey,
  getTurnkeyApiPrivateKey,
  getTurnkeyOrgId,
} from "../env";
import crypto from "crypto";

const CONNECT_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CODE_LENGTH = 6;

function generateConnectCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  }
  return code;
}

export const provisionAgent = internalAction({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args): Promise<void> => {
    // 1. Load agent record
    const agent = await ctx.runQuery(
      internal.internals.agentHelpers.getAgentById,
      { agentId: args.agentId },
    );
    if (!agent) {
      throw new Error(`Agent not found: ${args.agentId}`);
    }

    // 2. Idempotent: skip if already provisioned
    if (agent.turnkeyWalletId) {
      return;
    }

    // 3. Create Turnkey wallet
    let walletId: string;
    let publicKey: string;
    try {
      const turnkey = new Turnkey({
        apiBaseUrl: "https://api.turnkey.com",
        apiPublicKey: getTurnkeyApiPublicKey(),
        apiPrivateKey: getTurnkeyApiPrivateKey(),
        defaultOrganizationId: getTurnkeyOrgId(),
      });
      const client = await turnkey.apiClient();

      const wallet = await client.createWallet({
        walletName: `clawbank-agent-${args.agentId}`,
        accounts: [
          {
            curve: "CURVE_ED25519",
            pathFormat: "PATH_FORMAT_BIP32",
            path: "m/44'/501'/0'/0'",
            addressFormat: "ADDRESS_FORMAT_SOLANA",
          },
        ],
      });

      walletId = wallet.walletId;
      publicKey = wallet.addresses[0];
    } catch (err: unknown) {
      // Log failure to activity_log
      await ctx.runMutation(internal.internals.agentHelpers.logActivity, {
        workspaceId: agent.workspaceId,
        agentId: args.agentId,
        action: "provision_failed",
        metadata: {
          error: err instanceof Error ? err.message : "Unknown Turnkey error",
        },
      });
      throw new Error(
        `Turnkey wallet creation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }

    // 4. Generate connect code and hash it
    const connectCode = generateConnectCode();
    const hashedCode = crypto
      .createHash("sha256")
      .update(connectCode)
      .digest("hex");

    const now = Date.now();
    const expiresAt = now + CONNECT_CODE_TTL_MS;

    // 5. Update agent with wallet info and connect code
    await ctx.runMutation(
      internal.internals.agentHelpers.updateAgentProvision,
      {
        agentId: args.agentId,
        turnkeyWalletId: walletId,
        publicKey,
        connectCode,
        connectCodeExpiresAt: expiresAt,
      },
    );

    // 6. Store hashed code in agent_sessions
    await ctx.runMutation(
      internal.internals.agentHelpers.insertAgentSession,
      {
        agentId: args.agentId,
        tokenHash: hashedCode,
        expiresAt,
        sessionType: "connect_code",
      },
    );

    // 7. Log successful creation
    await ctx.runMutation(internal.internals.agentHelpers.logActivity, {
      workspaceId: agent.workspaceId,
      agentId: args.agentId,
      action: "agent_created",
    });
  },
});
