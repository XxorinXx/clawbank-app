import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const http = httpRouter();

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// ── POST /agent/connect ─────────────────────────────────────────────────

http.route({
  path: "/agent/connect",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { connectCode, authPublicKey } = body;

      if (!connectCode) {
        return errorResponse("connectCode required");
      }

      // Rate limit: 10 attempts per minute per IP (use path as fallback key)
      await ctx.runMutation(internal.internals.rateLimitCheck.check, {
        key: `connect:${request.headers.get("x-forwarded-for") ?? "unknown"}`,
        maxAttempts: 10,
        windowMs: 60_000,
      });

      const result = await ctx.runAction(
        api.actions.agentAuth.exchangeConnectCode,
        { connectCode, authPublicKey },
      );

      return jsonResponse(result);
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes("Rate limit")) {
        return errorResponse(message, 429);
      }
      return errorResponse(message, 401);
    }
  }),
});

// ── POST /agent/refresh ─────────────────────────────────────────────────

http.route({
  path: "/agent/refresh",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { refreshToken } = body;

      // Extract auth from headers (same pattern as other endpoints)
      const authHeader = request.headers.get("Authorization") ?? "";
      const dpopProof = request.headers.get("X-DPoP") ?? "";

      let accessToken: string;
      if (authHeader.startsWith("DPoP ")) {
        accessToken = authHeader.slice(5);
      } else if (authHeader.startsWith("Bearer ")) {
        accessToken = authHeader.slice(7);
      } else {
        accessToken = authHeader;
      }

      if (!refreshToken || !accessToken || !dpopProof) {
        return errorResponse(
          "refreshToken, Authorization header, and X-DPoP header required",
        );
      }

      const result = await ctx.runAction(
        api.actions.agentRefresh.agentRefresh,
        {
          refreshToken,
          accessToken,
          dpopProof,
          httpMethod: request.method,
          requestUrl: request.url,
        },
      );

      return jsonResponse(result);
    } catch (e) {
      return errorResponse((e as Error).message, 401);
    }
  }),
});

// ── Helper: extract auth from headers ───────────────────────────────────

async function authenticateRequest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  request: Request,
  _actionPath: string,
): Promise<{
  agentId: Id<"agents">;
  workspaceId: Id<"workspaces">;
  sessionId: Id<"agent_sessions">;
  authVersion: "v1" | "v2";
}> {
  const authHeader = request.headers.get("Authorization") ?? "";
  const dpopHeader = request.headers.get("X-DPoP") ?? "";

  // Support both "DPoP <token>" and "Bearer <token>"
  let accessToken: string;
  if (authHeader.startsWith("DPoP ")) {
    accessToken = authHeader.slice(5);
  } else if (authHeader.startsWith("Bearer ")) {
    accessToken = authHeader.slice(7);
  } else {
    accessToken = authHeader;
  }

  if (!accessToken) {
    throw new Error("Authorization header required");
  }

  const result = (await ctx.runAction(
    internal.actions.httpAuth.authenticate as never,
    {
      sessionToken: accessToken,
      dpopProof: dpopHeader || undefined,
      httpMethod: request.method,
      actionPath: request.url,
    },
  )) as {
    agentId: string;
    workspaceId: string;
    sessionId: string;
    authVersion: "v1" | "v2";
  };

  return {
    agentId: result.agentId as Id<"agents">,
    workspaceId: result.workspaceId as Id<"workspaces">,
    sessionId: result.sessionId as Id<"agent_sessions">,
    authVersion: result.authVersion,
  };
}

// ── POST /agent/transfer ────────────────────────────────────────────────

http.route({
  path: "/agent/transfer",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      await authenticateRequest(ctx, request, "/agent/transfer");

      const body = await request.json();
      const { recipient, amountSol, shortNote, description } = body;

      if (!recipient || !amountSol || !shortNote || !description) {
        return errorResponse(
          "recipient, amountSol, shortNote, and description required",
        );
      }

      // For v2 auth, we've already verified DPoP in authenticateRequest.
      // Now extract the access token again to pass to the existing transfer action.
      const authHeader = request.headers.get("Authorization") ?? "";
      let sessionToken: string;
      if (authHeader.startsWith("DPoP ")) {
        sessionToken = authHeader.slice(5);
      } else if (authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      } else {
        sessionToken = authHeader;
      }

      const result = await ctx.runAction(
        api.actions.agentTransfer.agentTransfer,
        {
          sessionToken,
          recipient,
          amountSol,
          shortNote,
          description,
        },
      );

      return jsonResponse(result);
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes("Invalid") || message.includes("expired")) {
        return errorResponse(message, 401);
      }
      return errorResponse(message, 400);
    }
  }),
});

// ── POST /agent/status ──────────────────────────────────────────────────

http.route({
  path: "/agent/status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      await authenticateRequest(ctx, request, "/agent/status");

      const authHeader = request.headers.get("Authorization") ?? "";
      let sessionToken: string;
      if (authHeader.startsWith("DPoP ")) {
        sessionToken = authHeader.slice(5);
      } else if (authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      } else {
        sessionToken = authHeader;
      }

      const result = await ctx.runAction(api.actions.agentAuth.agentStatus, {
        sessionToken,
      });

      return jsonResponse(result);
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes("Invalid") || message.includes("expired")) {
        return errorResponse(message, 401);
      }
      return errorResponse(message, 400);
    }
  }),
});

export default http;
