import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireWorkspaceMember } from "../internals/workspaceHelpers";

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    category: v.optional(
      v.union(
        v.literal("transaction"),
        v.literal("config"),
        v.literal("agent_lifecycle"),
      ),
    ),
    paginationOpts: v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    }),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId);

    let q = ctx.db
      .query("activity_log")
      .withIndex("by_workspace", (qb) =>
        qb.eq("workspaceId", args.workspaceId),
      )
      .order("desc");

    if (args.category) {
      q = q.filter((qb) => qb.eq(qb.field("category"), args.category));
    }

    const result = await q.paginate(args.paginationOpts);

    // Enrich with agent names
    const enrichedPage = await Promise.all(
      result.page.map(async (entry) => {
        let agentName: string | undefined;
        if (entry.agentId) {
          const agent = await ctx.db.get(entry.agentId);
          agentName = agent?.name;
        }
        return { ...entry, agentName };
      }),
    );

    return {
      ...result,
      page: enrichedPage,
    };
  },
});
