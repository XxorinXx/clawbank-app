"use node";

import { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { sha256Hex } from "./connectCode";
import { verifyDPoPProof } from "./dpop";
import type { Id } from "../_generated/dataModel";

interface AuthResult {
  agentId: Id<"agents">;
  workspaceId: Id<"workspaces">;
  sessionId: Id<"agent_sessions">;
  authVersion: "v1" | "v2";
}

export async function authenticateAgentRequest(
  ctx: ActionCtx,
  opts: {
    sessionToken: string;
    dpopProof?: string;
    httpMethod?: string;
    actionPath?: string;
  },
): Promise<AuthResult> {
  const tokenHash = sha256Hex(opts.sessionToken);

  const session = await ctx.runQuery(
    internal.internals.agentHelpers.getSessionByHash,
    { tokenHash },
  );

  if (!session) {
    throw new Error("Invalid session token");
  }

  const validTypes = ["session", "access"];
  if (!validTypes.includes(session.sessionType)) {
    throw new Error("Invalid session type");
  }

  if (session.expiresAt <= Date.now()) {
    throw new Error("Session expired");
  }

  const authVersion = session.authVersion ?? "v1";

  if (authVersion === "v2") {
    if (!opts.dpopProof || !opts.httpMethod || !opts.actionPath) {
      throw new Error("DPoP proof required for v2 authentication");
    }

    // Load agent to get authPublicKey
    const agent = await ctx.runQuery(
      internal.internals.agentHelpers.getAgentById,
      { agentId: session.agentId },
    );

    if (!agent || !agent.authPublicKey) {
      throw new Error("Agent not found or missing auth public key");
    }

    const dpopResult = verifyDPoPProof(
      opts.dpopProof,
      agent.authPublicKey,
      opts.httpMethod,
      opts.actionPath,
      opts.sessionToken,
    );

    if (!dpopResult.valid) {
      throw new Error(`DPoP verification failed: ${dpopResult.error}`);
    }

    // Check nonce for replay protection
    await ctx.runMutation(
      internal.internals.dpopHelpers.checkAndStoreNonce,
      { jti: dpopResult.payload!.jti, agentId: session.agentId },
    );
  }

  // Update lastUsedAt
  await ctx.runMutation(
    internal.internals.agentHelpers.updateSessionLastUsed,
    { sessionId: session._id },
  );

  // Load agent for workspaceId
  const agent = await ctx.runQuery(
    internal.internals.agentHelpers.getAgentById,
    { agentId: session.agentId },
  );

  if (!agent) {
    throw new Error("Agent not found");
  }

  return {
    agentId: session.agentId,
    workspaceId: agent.workspaceId,
    sessionId: session._id,
    authVersion,
  };
}
