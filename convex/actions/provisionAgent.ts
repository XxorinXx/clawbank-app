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
import { makeConnectCode, sha256Hex, CONNECT_CODE_TTL_MS } from "../lib/connectCode";
import { extractErrorMessage } from "../lib/turnkeyHelpers";

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
      const errorMsg = extractErrorMessage(err, "Unknown Turnkey error");
      // Log failure to activity_log
      await ctx.runMutation(internal.internals.agentHelpers.logActivity, {
        workspaceId: agent.workspaceId,
        agentId: args.agentId,
        actorType: "human",
        actorLabel: agent.name,
        category: "agent_lifecycle",
        action: "provision_failed",
        metadata: { error: errorMsg },
      });
      throw new Error(`Turnkey wallet creation failed: ${errorMsg}`);
    }

    // 4. Generate connect code and hash it
    const connectCode = makeConnectCode();
    const hashedCode = sha256Hex(connectCode);

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
      actorType: "human",
      actorLabel: agent.name,
      category: "agent_lifecycle",
      action: "agent_created",
    });
  },
});
