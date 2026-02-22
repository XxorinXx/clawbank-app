"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import crypto from "crypto";

const CONNECT_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CODE_LENGTH = 6;

function makeConnectCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  }
  return code;
}

export const generateConnectCode = action({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args): Promise<{ connectCode: string; expiresAt: number }> => {
    // 1. Auth check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    // 2. Load agent, verify exists and not revoked
    const agent = await ctx.runQuery(
      internal.internals.agentHelpers.getAgentById,
      { agentId: args.agentId },
    );
    if (!agent) throw new Error("Agent not found");
    if (agent.status === "revoked") {
      throw new Error("Cannot generate connect code for a revoked agent");
    }

    // 3. Generate code and hash it
    const connectCode = makeConnectCode();
    const hashedCode = crypto
      .createHash("sha256")
      .update(connectCode)
      .digest("hex");

    const now = Date.now();
    const expiresAt = now + CONNECT_CODE_TTL_MS;

    // 4. Delete any existing connect_code sessions for this agent
    await ctx.runMutation(
      internal.internals.agentHelpers.deleteConnectCodeSessions,
      { agentId: args.agentId },
    );

    // 5. Insert new connect_code session with hashed token
    await ctx.runMutation(
      internal.internals.agentHelpers.insertAgentSession,
      {
        agentId: args.agentId,
        tokenHash: hashedCode,
        expiresAt,
        sessionType: "connect_code",
      },
    );

    // 6. Update agent with raw connect code (for UI display)
    await ctx.runMutation(
      internal.internals.agentHelpers.updateAgentConnectCode,
      {
        agentId: args.agentId,
        connectCode,
        connectCodeExpiresAt: expiresAt,
      },
    );

    return { connectCode, expiresAt };
  },
});
