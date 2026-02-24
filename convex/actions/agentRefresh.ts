"use node";

import crypto from "node:crypto";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { sha256Hex } from "../lib/connectCode";
import { verifyDPoPProof } from "../lib/dpop";

export const agentRefresh = action({
  args: {
    refreshToken: v.string(),
    accessToken: v.string(),
    dpopProof: v.string(),
    httpMethod: v.string(),
    requestUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const refreshHash = sha256Hex(args.refreshToken);

    // Look up refresh session
    const refreshSession = await ctx.runQuery(
      internal.internals.agentHelpers.getSessionByHash,
      { tokenHash: refreshHash },
    );

    if (
      !refreshSession ||
      refreshSession.sessionType !== "refresh" ||
      refreshSession.expiresAt <= Date.now()
    ) {
      throw new Error("Invalid or expired refresh token");
    }

    // Load agent for public key
    const agent = await ctx.runQuery(
      internal.internals.agentHelpers.getAgentById,
      { agentId: refreshSession.agentId },
    );

    if (!agent || !agent.authPublicKey) {
      throw new Error("Agent not found or missing public key");
    }

    // Verify DPoP proof
    const dpopResult = verifyDPoPProof(
      args.dpopProof,
      agent.authPublicKey,
      args.httpMethod,
      args.requestUrl,
      args.accessToken,
    );

    if (!dpopResult.valid) {
      throw new Error(`DPoP verification failed: ${dpopResult.error}`);
    }

    // Check nonce for replay protection
    await ctx.runMutation(
      internal.internals.dpopHelpers.checkAndStoreNonce,
      { jti: dpopResult.payload!.jti, agentId: refreshSession.agentId },
    );

    // Revoke all existing sessions for this agent (token rotation)
    await ctx.runMutation(
      internal.internals.dpopHelpers.revokeAllAgentSessions,
      { agentId: refreshSession.agentId },
    );

    // Generate new token pair
    const newAccessToken = crypto.randomBytes(32).toString("hex");
    const newRefreshToken = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    const newSequence = (refreshSession.refreshSequence ?? 0) + 1;

    // Insert new access session (5 min)
    await ctx.runMutation(
      internal.internals.agentHelpers.insertAgentSession,
      {
        agentId: refreshSession.agentId,
        tokenHash: sha256Hex(newAccessToken),
        expiresAt: now + 5 * 60 * 1000,
        sessionType: "access",
        authVersion: "v2",
        refreshTokenFamily: refreshSession.refreshTokenFamily,
        refreshSequence: newSequence,
      },
    );

    // Insert new refresh session (30 days)
    await ctx.runMutation(
      internal.internals.agentHelpers.insertAgentSession,
      {
        agentId: refreshSession.agentId,
        tokenHash: sha256Hex(newRefreshToken),
        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
        sessionType: "refresh",
        authVersion: "v2",
        refreshTokenFamily: refreshSession.refreshTokenFamily,
        refreshSequence: newSequence,
      },
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 300,
    };
  },
});
