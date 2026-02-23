"use node";

import crypto from "node:crypto";

const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CODE_LENGTH = 6;
export const CONNECT_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generates a cryptographically random 6-character alphanumeric connect code.
 */
export function makeConnectCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  }
  return code;
}

/**
 * SHA-256 hash a string and return the hex digest.
 * Used for hashing connect codes and session tokens before storage.
 */
export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
