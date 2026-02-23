import { query } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { requireWorkspaceMember } from "../internals/workspaceHelpers";

type MemberInfo = {
  _id: Id<"workspace_members">;
  walletAddress: string;
  role: "creator" | "member";
  addedAt: number;
};

type InviteInfo = {
  _id: Id<"workspace_invites">;
  email: string;
  status: "pending" | "accepted" | "rejected";
  invitedAt: number;
};

export const getWorkspaceMembers = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args): Promise<{ members: MemberInfo[]; invites: InviteInfo[] }> => {
    await requireWorkspaceMember(ctx, args.workspaceId);

    // Get members
    const members = await ctx.db
      .query("workspace_members")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .collect();

    // Get invites
    const invites = await ctx.db
      .query("workspace_invites")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .collect();

    return {
      members: members.map((m) => ({
        _id: m._id,
        walletAddress: m.walletAddress,
        role: m.role,
        addedAt: m.addedAt,
      })),
      invites: invites.map((inv) => ({
        _id: inv._id,
        email: inv.email,
        status: inv.status,
        invitedAt: inv.invitedAt,
      })),
    };
  },
});
