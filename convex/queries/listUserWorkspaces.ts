import { query } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

type WorkspaceSummary = {
  _id: Id<"workspaces">;
  name: string;
  vaultAddress: string;
  createdAt: number;
};

export const listUserWorkspaces = query({
  args: {},
  handler: async (ctx): Promise<WorkspaceSummary[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    // 1. Workspaces where user is the creator
    const createdWorkspaces = await ctx.db
      .query("workspaces")
      .withIndex("by_creator", (q) =>
        q.eq("creatorTokenIdentifier", identity.tokenIdentifier),
      )
      .collect();

    // 2. Get the user's wallet to find workspaces they're a member of
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    const memberWorkspaces: Doc<"workspaces">[] = [];

    if (user) {
      const memberships = await ctx.db
        .query("workspace_members")
        .withIndex("by_wallet", (q) =>
          q.eq("walletAddress", user.walletAddress),
        )
        .collect();

      // Filter out workspaces where user is already counted as creator
      const createdIds = new Set(createdWorkspaces.map((w) => w._id));
      const memberWorkspaceIds = memberships
        .map((m) => m.workspaceId)
        .filter((id) => !createdIds.has(id));

      // Fetch workspace details for member-only entries
      for (const wsId of memberWorkspaceIds) {
        const ws = await ctx.db.get(wsId);
        if (ws) {
          memberWorkspaces.push(ws);
        }
      }
    }

    // Combine and return
    const allWorkspaces = [...createdWorkspaces, ...memberWorkspaces];

    return allWorkspaces.map((ws) => ({
      _id: ws._id,
      name: ws.name,
      vaultAddress: ws.vaultAddress,
      createdAt: ws.createdAt,
    }));
  },
});
