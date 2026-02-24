import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup expired DPoP nonces",
  { minutes: 5 },
  internal.internals.dpopHelpers.cleanupExpiredNonces,
);

export default crons;
