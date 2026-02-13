"use node";

import crypto from "node:crypto";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Doc } from "../_generated/dataModel";

interface ExchangeResult {
  sessionToken: string;
  agentId: string;
  workspaceId: string;
  publicKey: string | undefined;
  expiresAt: number;
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
  args: { connectCode: v.string() },
  handler: async (ctx, args): Promise<ExchangeResult> => {
    const connectCode = args.connectCode.trim().toUpperCase();

    // Hash the connect code to look up the session
    const codeHash = crypto
      .createHash("sha256")
      .update(connectCode)
      .digest("hex");

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

    // Generate a new session token (returned once, never stored raw)
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(sessionToken)
      .digest("hex");

    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

    // Delete the connect-code session (single-use)
    await ctx.runMutation(
      internal.internals.agentHelpers.deleteSession,
      { sessionId: session._id },
    );

    // Insert the new session
    await ctx.runMutation(
      internal.internals.agentHelpers.insertAgentSession,
      {
        agentId: session.agentId,
        tokenHash: hashedToken,
        expiresAt,
        sessionType: "session",
      },
    );

    // Update agent status to active and clear the connect code
    await ctx.runMutation(
      internal.internals.agentHelpers.updateAgentStatus,
      {
        agentId: session.agentId,
        status: "active",
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
        action: "session_created",
      },
    );

    return {
      sessionToken,
      agentId: session.agentId as string,
      workspaceId: agent.workspaceId as string,
      publicKey: agent.publicKey,
      expiresAt,
    };
  },
});

export const agentStatus = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, args): Promise<StatusResult> => {
    // Hash the session token
    const tokenHash = crypto
      .createHash("sha256")
      .update(args.sessionToken)
      .digest("hex");

    // Look up the session
    const session = await ctx.runQuery(
      internal.internals.agentHelpers.getSessionByHash,
      { tokenHash },
    );

    if (
      !session ||
      session.sessionType !== "session" ||
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
