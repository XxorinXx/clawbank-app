/** Truncate a Solana address or similar long string. */
export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/** Format a Unix-ms timestamp as "Jan 1, 2025". */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Format a USD value with appropriate precision. */
export function formatUsd(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}M`;
  }
  if (value >= 0.01) {
    return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (value > 0) {
    return "<$0.01";
  }
  return "$0.00";
}

/** Convert lamports to SOL. */
export function lamportsToSol(lamports: number): number {
  return lamports / 1_000_000_000;
}

/** Format a SOL amount as a human-readable string (avoids scientific notation). */
export function formatSol(lamports: number): string {
  if (lamports === 0) return "0";
  const sol = lamports / 1_000_000_000;
  if (sol >= 1) return sol.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (sol >= 0.000000001) {
    // Show up to 9 decimal places without trailing zeros
    const str = sol.toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
    return str;
  }
  // Sub-lamport values (shouldn't happen in practice, but handle gracefully)
  return sol.toExponential(2);
}

/** Format lamports as a USD string given a SOL price. */
export function formatLamportsAsUsd(lamports: number, solPriceUsd: number): string {
  const sol = lamports / 1_000_000_000;
  const usd = sol * solPriceUsd;
  return formatUsd(usd);
}

/** Format a timestamp as a relative time string ("Just now", "2 min ago", etc.). */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1_000);
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return formatDate(timestamp);
}

/** Format a full date-time string for tooltips. */
export function formatFullDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const ACTION_TITLES: Record<string, string> = {
  transfer_executed: "Transfer sent",
  transfer_failed: "Transfer failed",
  transfer_proposal_created: "Approval requested",
  transfer_proposal_failed: "Approval request failed",
  transfer_approved: "Transfer approved",
  transfer_denied: "Transfer denied",
  agent_connected: "Agent connected",
  agent_activated: "Agent activated",
  agent_revoked: "Agent removed",
  agent_created: "Agent created",
  member_added: "Member added",
  member_removed: "Member removed",
  spending_limit_updated: "Spending limit updated",
  provision_failed: "Agent setup failed",
  workspace_created: "Vault created",
};

/** Map an activity action to a human-readable title. */
export function activityTitle(
  action: string,
  metadata?: Record<string, unknown>,
): string {
  const base = ACTION_TITLES[action];
  if (base) {
    // Enrich transfer titles with truncated recipient
    if (
      (action === "transfer_executed" || action === "transfer_proposal_created") &&
      typeof metadata?.recipient === "string"
    ) {
      return `${base} to ${truncateAddress(metadata.recipient)}`;
    }
    return base;
  }
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Generate a short description for an activity entry from action + metadata. */
export function activityDescription(
  action: string,
  metadata?: Record<string, unknown>,
): string {
  if (!metadata) return "";

  const recipient = metadata.recipient as string | undefined;
  const agentName = metadata.agentName as string | undefined;
  const memberEmail = metadata.memberEmail as string | undefined;
  const walletAddress = metadata.walletAddress as string | undefined;
  const errorMessage = metadata.errorMessage as string | undefined;
  const limitAmount = metadata.limitAmount as number | undefined;
  const periodType = metadata.periodType as string | undefined;

  switch (action) {
    case "transfer_executed":
    case "transfer_proposal_created":
      return recipient
        ? `To ${truncateAddress(recipient)}`
        : "";
    case "transfer_failed":
    case "transfer_proposal_failed":
      return errorMessage ? errorMessage : "Transaction could not be completed";
    case "transfer_approved":
      return recipient
        ? `Transfer to ${truncateAddress(recipient)} approved`
        : "Transfer approved";
    case "transfer_denied":
      return recipient
        ? `Transfer to ${truncateAddress(recipient)} denied`
        : "Transfer denied";
    case "agent_connected":
    case "agent_activated":
    case "agent_revoked":
    case "agent_created":
      return agentName ?? "";
    case "member_added":
      return memberEmail ?? walletAddress ? truncateAddress(walletAddress ?? "") : "";
    case "member_removed":
      return memberEmail ?? walletAddress ? truncateAddress(walletAddress ?? "") : "";
    case "spending_limit_updated":
      return limitAmount != null && periodType
        ? `${formatSol(limitAmount)} SOL / ${periodType}`
        : "";
    case "provision_failed":
      return errorMessage ?? "Provisioning could not be completed";
    case "workspace_created":
      return (metadata.workspaceName as string) ?? "";
    default:
      return "";
  }
}
