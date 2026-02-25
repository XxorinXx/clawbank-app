"use node";

import crypto from "node:crypto";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";
import { sha256Hex } from "../lib/connectCode";
import { base64urlDecode } from "../lib/dpop";

interface ExchangeResult {
  // v1 fields
  sessionToken?: string;
  expiresAt?: number;
  // v2 fields
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  serverSalt?: string;
  // shared
  agentId: string;
  workspaceId: string;
  publicKey: string | undefined;
}

interface StatusResult {
  agentId: string;
  workspaceId: string;
  status: Doc<"agents">["status"];
  limits: {
    tokenMint: string;
    limitAmount: number;
    spentAmount: number;
    periodType: string;
    periodStart: number;
  }[];
}

export const exchangeConnectCode = action({
  args: {
    connectCode: v.string(),
    authPublicKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ExchangeResult> => {
    const connectCode = args.connectCode.trim().toUpperCase();

    // Hash the connect code to look up the session
    const codeHash = sha256Hex(connectCode);

    // Look up the connect-code session
    const session = await ctx.runQuery(
      internal.internals.agentHelpers.getSessionByHash,
      { tokenHash: codeHash },
    );

    if (
      !session ||
      session.sessionType !== "connect_code" ||
      session.expiresAt <= Date.now()
    ) {
      throw new Error("Invalid or expired connect code");
    }

    // Delete the connect-code session (single-use)
    await ctx.runMutation(
      internal.internals.agentHelpers.deleteSession,
      { sessionId: session._id },
    );

    // Update agent status to connected
    await ctx.runMutation(
      internal.internals.agentHelpers.updateAgentStatus,
      {
        agentId: session.agentId,
        status: "connected",
        clearConnectCode: true,
      },
    );

    // Load the agent record
    const agent = await ctx.runQuery(
      internal.internals.agentHelpers.getAgentById,
      { agentId: session.agentId },
    );

    if (!agent) {
      throw new Error("Agent not found");
    }

    // Log activity
    await ctx.runMutation(
      internal.internals.agentHelpers.logActivity,
      {
        workspaceId: agent.workspaceId,
        agentId: session.agentId,
        actorType: "agent",
        actorLabel: agent.name,
        category: "agent_lifecycle",
        action: "agent_connected",
      },
    );

    if (args.authPublicKey) {
      // ── v2 flow (DPoP) ──────────────────────────────────────────────
      const keyBytes = base64urlDecode(args.authPublicKey);
      if (keyBytes.length !== 32) {
        throw new Error("Invalid public key: must be 32 bytes");
      }

      // Store auth public key on agent
      await ctx.runMutation(
        internal.internals.agentHelpers.updateAgentAuthPublicKey,
        { agentId: session.agentId, authPublicKey: args.authPublicKey },
      );

      // Generate tokens
      const accessToken = crypto.randomBytes(32).toString("hex");
      const refreshToken = crypto.randomBytes(32).toString("hex");
      const accessHash = sha256Hex(accessToken);
      const refreshHash = sha256Hex(refreshToken);
      const refreshTokenFamily = crypto.randomUUID();
      const serverSalt = crypto.randomBytes(32).toString("hex");

      const now = Date.now();

      // Insert access session (5 min)
      await ctx.runMutation(
        internal.internals.agentHelpers.insertAgentSession,
        {
          agentId: session.agentId,
          tokenHash: accessHash,
          expiresAt: now + 5 * 60 * 1000,
          sessionType: "access",
          authVersion: "v2",
          refreshTokenFamily,
          refreshSequence: 0,
        },
      );

      // Insert refresh session (30 days)
      await ctx.runMutation(
        internal.internals.agentHelpers.insertAgentSession,
        {
          agentId: session.agentId,
          tokenHash: refreshHash,
          expiresAt: now + 30 * 24 * 60 * 60 * 1000,
          sessionType: "refresh",
          authVersion: "v2",
          refreshTokenFamily,
          refreshSequence: 0,
        },
      );

      return {
        accessToken,
        refreshToken,
        agentId: session.agentId as string,
        workspaceId: agent.workspaceId as string,
        publicKey: agent.publicKey,
        expiresIn: 300,
        serverSalt,
      };
    } else {
      // ── v1 flow (bearer token) ──────────────────────────────────────
      const sessionToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = sha256Hex(sessionToken);

      const now = Date.now();
      const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

      await ctx.runMutation(
        internal.internals.agentHelpers.insertAgentSession,
        {
          agentId: session.agentId,
          tokenHash: hashedToken,
          expiresAt,
          sessionType: "session",
        },
      );

      return {
        sessionToken,
        agentId: session.agentId as string,
        workspaceId: agent.workspaceId as string,
        publicKey: agent.publicKey,
        expiresAt,
      };
    }
  },
});

export const agentStatus = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, args): Promise<StatusResult> => {
    // Hash the session token
    const tokenHash = sha256Hex(args.sessionToken);

    // Look up the session
    const session = await ctx.runQuery(
      internal.internals.agentHelpers.getSessionByHash,
      { tokenHash },
    );

    if (
      !session ||
      (session.sessionType !== "session" && session.sessionType !== "access") ||
      session.expiresAt <= Date.now()
    ) {
      throw new Error("Invalid or expired session");
    }

    // Update lastUsedAt
    await ctx.runMutation(
      internal.internals.agentHelpers.updateSessionLastUsed,
      { sessionId: session._id },
    );

    // Load agent record
    const agent = await ctx.runQuery(
      internal.internals.agentHelpers.getAgentById,
      { agentId: session.agentId },
    );

    if (!agent) {
      throw new Error("Agent not found");
    }

    // Load spending limits
    const limits = await ctx.runQuery(
      internal.internals.agentHelpers.getSpendingLimitsByAgent,
      { agentId: session.agentId },
    );

    return {
      agentId: session.agentId as string,
      workspaceId: agent.workspaceId as string,
      status: agent.status,
      limits: limits.map((l) => ({
        tokenMint: l.tokenMint,
        limitAmount: l.limitAmount,
        spentAmount: l.spentAmount,
        periodType: l.periodType,
        periodStart: l.periodStart,
      })),
    };
  },
});
