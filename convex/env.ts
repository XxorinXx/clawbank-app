/** Validated Convex environment variables. NEVER log values from this module. */

import bs58 from "bs58";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export function getPrivyAppId(): string {
  return requireEnv("PRIVY_APP_ID");
}

export function getRpcUrl(): string {
  return requireEnv("RPC_URL");
}

export function getJupiterApiKey(): string {
  return requireEnv("JUPITER_API_KEY");
}

export function getTurnkeyApiPublicKey(): string {
  return requireEnv("TURNKEY_API_PUBLIC_KEY");
}

/**
 * Returns the Turnkey API private key for request stamping.
 * NEVER log, return to client, or include in error messages.
 */
export function getTurnkeyApiPrivateKey(): string {
  return requireEnv("TURNKEY_API_PRIVATE_KEY");
}

export function getTurnkeyOrgId(): string {
  return requireEnv("TURNKEY_ORGANIZATION_ID");
}

/**
 * Returns the sponsor private key bytes decoded from bs58.
 * NEVER log, return to client, or include in error messages.
 */
export function getSponsorKey(): Uint8Array {
  const raw = requireEnv("SPONSOR_PRIVATE_KEY");
  let decoded: Uint8Array;
  try {
    decoded = bs58.decode(raw);
  } catch {
    throw new Error("Server configuration error: invalid sponsor key format");
  }
  if (decoded.length !== 64) {
    throw new Error("Server configuration error: invalid sponsor key length");
  }
  return decoded;
}
