"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { authenticateAgentRequest } from "../lib/authMiddleware";

export const authenticate = internalAction({
  args: {
    sessionToken: v.string(),
    dpopProof: v.optional(v.string()),
    httpMethod: v.optional(v.string()),
    actionPath: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const result = await authenticateAgentRequest(ctx, {
      sessionToken: args.sessionToken,
      dpopProof: args.dpopProof ?? undefined,
      httpMethod: args.httpMethod ?? undefined,
      actionPath: args.actionPath ?? undefined,
    });
    return {
      agentId: result.agentId as string,
      workspaceId: result.workspaceId as string,
      sessionId: result.sessionId as string,
      authVersion: result.authVersion,
    };
  },
});
