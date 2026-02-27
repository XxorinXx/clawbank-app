import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatRelativeTime,
  activityTitle,
  activityDescription,
  formatFullDateTime,
} from "./format";

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Just now" for timestamps less than 60s ago', () => {
    expect(formatRelativeTime(Date.now() - 30_000)).toBe("Just now");
    expect(formatRelativeTime(Date.now() - 1_000)).toBe("Just now");
    expect(formatRelativeTime(Date.now())).toBe("Just now");
  });

  it('returns "X min ago" for timestamps 1-59 minutes ago', () => {
    expect(formatRelativeTime(Date.now() - 60_000)).toBe("1 min ago");
    expect(formatRelativeTime(Date.now() - 120_000)).toBe("2 min ago");
    expect(formatRelativeTime(Date.now() - 59 * 60_000)).toBe("59 min ago");
  });

  it('returns "X hour(s) ago" for timestamps 1-23 hours ago', () => {
    expect(formatRelativeTime(Date.now() - 3_600_000)).toBe("1 hour ago");
    expect(formatRelativeTime(Date.now() - 7_200_000)).toBe("2 hours ago");
    expect(formatRelativeTime(Date.now() - 23 * 3_600_000)).toBe(
      "23 hours ago",
    );
  });

  it('returns "Yesterday" for timestamps 1 day ago', () => {
    expect(formatRelativeTime(Date.now() - 86_400_000)).toBe("Yesterday");
  });

  it('returns "X days ago" for timestamps 2-6 days ago', () => {
    expect(formatRelativeTime(Date.now() - 2 * 86_400_000)).toBe("2 days ago");
    expect(formatRelativeTime(Date.now() - 6 * 86_400_000)).toBe("6 days ago");
  });

  it("returns formatted date for timestamps 7+ days ago", () => {
    const sevenDaysAgo = Date.now() - 7 * 86_400_000;
    const result = formatRelativeTime(sevenDaysAgo);
    expect(result).toMatch(/Jun \d+, 2025/);
  });
});

describe("formatFullDateTime", () => {
  it("formats a timestamp as full date-time", () => {
    const ts = new Date("2025-01-15T14:30:00Z").getTime();
    const result = formatFullDateTime(ts);
    expect(result).toContain("Jan");
    expect(result).toContain("15");
    expect(result).toContain("2025");
  });
});

describe("activityTitle", () => {
  it("maps known actions to human-readable titles", () => {
    expect(activityTitle("transfer_executed")).toBe("Transfer sent");
    expect(activityTitle("transfer_failed")).toBe("Transfer failed");
    expect(activityTitle("transfer_proposal_created")).toBe(
      "Approval requested",
    );
    expect(activityTitle("agent_connected")).toBe("Agent connected");
    expect(activityTitle("agent_revoked")).toBe("Agent removed");
    expect(activityTitle("member_added")).toBe("Member added");
    expect(activityTitle("spending_limit_updated")).toBe(
      "Spending limit updated",
    );
    expect(activityTitle("provision_failed")).toBe("Agent setup failed");
    expect(activityTitle("workspace_created")).toBe("Vault created");
  });

  it("capitalizes and replaces underscores for unknown actions", () => {
    expect(activityTitle("some_new_action")).toBe("Some New Action");
  });

  it("enriches transfer titles with recipient when metadata provided", () => {
    const result = activityTitle("transfer_executed", {
      recipient: "4MnEnMnVnMnAnMnBnMnCnMnDnMnEnMnFnMnGnMnH",
    });
    expect(result).toContain("Transfer sent to");
    expect(result).toContain("...");
  });
});

describe("activityDescription", () => {
  it("returns empty string when no metadata", () => {
    expect(activityDescription("transfer_executed")).toBe("");
  });

  it("generates transfer description with recipient", () => {
    const result = activityDescription("transfer_executed", {
      recipient: "4MnEnMnVnMnAnMnBnMnCnMnDnMnEnMnFnMnGnMnH",
    });
    expect(result).toContain("To");
    expect(result).toContain("...");
  });

  it("generates agent description with agent name", () => {
    expect(
      activityDescription("agent_connected", { agentName: "Trading Bot" }),
    ).toBe("Trading Bot");
  });

  it("generates spending limit description", () => {
    const result = activityDescription("spending_limit_updated", {
      limitAmount: 5_000_000_000,
      periodType: "daily",
    });
    expect(result).toBe("5 SOL / daily");
  });
});
