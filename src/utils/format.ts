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
