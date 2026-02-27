const KNOWN_PROGRAMS: Record<string, string> = {
  "11111111111111111111111111111111": "System Program",
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: "Token Program",
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: "Associated Token",
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: "Jupiter v6",
  ComputeBudget111111111111111111111111111111: "Compute Budget",
};

export function getProgramName(programId: string): string {
  return (
    KNOWN_PROGRAMS[programId] ??
    `${programId.slice(0, 4)}...${programId.slice(-4)}`
  );
}
