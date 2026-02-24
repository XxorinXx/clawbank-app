import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { checkRateLimit } from "../lib/rateLimit";

export const check = internalMutation({
  args: {
    key: v.string(),
    maxAttempts: v.number(),
    windowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const result = await checkRateLimit(
      ctx,
      args.key,
      args.maxAttempts,
      args.windowMs,
    );
    if (!result.allowed) {
      throw new Error("Rate limit exceeded");
    }
    return result;
  },
});
