import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireWorkspaceMember } from "../internals/workspaceHelpers";

export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId);

    const requests = await ctx.db
      .query("transfer_requests")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .collect();

    // Enrich with agent names
    const results = [];
    for (const req of requests) {
      const agent = await ctx.db.get(req.agentId);
      results.push({
        ...req,
        agentName: agent?.name ?? "Unknown Agent",
      });
    }
    return results;
  },
});
