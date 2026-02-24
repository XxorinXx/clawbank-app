import { MutationCtx } from "../_generated/server";

export async function checkRateLimit(
  ctx: MutationCtx,
  key: string,
  maxAttempts: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const now = Date.now();
  const existing = await ctx.db
    .query("agent_rate_limits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  if (!existing || existing.windowStart + windowMs < now) {
    // Window expired or no record — reset
    if (existing) {
      await ctx.db.patch(existing._id, { windowStart: now, count: 1 });
    } else {
      await ctx.db.insert("agent_rate_limits", {
        key,
        windowStart: now,
        count: 1,
      });
    }
    return { allowed: true, remaining: maxAttempts - 1 };
  }

  if (existing.count >= maxAttempts) {
    return { allowed: false, remaining: 0 };
  }

  await ctx.db.patch(existing._id, { count: existing.count + 1 });
  return { allowed: true, remaining: maxAttempts - existing.count - 1 };
}
