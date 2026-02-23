"use node";

import { Turnkey } from "@turnkey/sdk-server";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import {
  getTurnkeyApiPublicKey,
  getTurnkeyApiPrivateKey,
  getTurnkeyOrgId,
} from "../env";

/**
 * Signs a VersionedTransaction using the Turnkey API for the given address.
 * The agent's Solana keypair is custodied by Turnkey — this function retrieves
 * the raw Ed25519 signature and places it in the correct signer slot.
 */
export async function signWithTurnkey(
  tx: VersionedTransaction,
  signWithAddress: string,
): Promise<VersionedTransaction> {
  const turnkey = new Turnkey({
    apiBaseUrl: "https://api.turnkey.com",
    apiPublicKey: getTurnkeyApiPublicKey(),
    apiPrivateKey: getTurnkeyApiPrivateKey(),
    defaultOrganizationId: getTurnkeyOrgId(),
  });
  const client = await turnkey.apiClient();

  const messageBytes = tx.message.serialize();
  const signResult = await client.signRawPayload({
    signWith: signWithAddress,
    payload: Buffer.from(messageBytes).toString("hex"),
    encoding: "PAYLOAD_ENCODING_HEXADECIMAL",
    hashFunction: "HASH_FUNCTION_NOT_APPLICABLE",
  });

  // Reconstruct the signature from r + s (each 32 bytes hex = 64 chars)
  const sigBytes = Buffer.from(signResult.r + signResult.s, "hex");

  // Add the signature at the agent's position
  const agentPubkey = new PublicKey(signWithAddress);
  const signerIndex = tx.message.staticAccountKeys.findIndex((key) =>
    key.equals(agentPubkey),
  );
  if (signerIndex === -1) {
    throw new Error("Agent public key not found in transaction signers");
  }
  tx.signatures[signerIndex] = sigBytes;

  return tx;
}

/**
 * Extracts a user-facing error message from an unknown thrown value.
 */
export function extractErrorMessage(err: unknown, fallback = "Unknown error"): string {
  return err instanceof Error ? err.message : fallback;
}

/** Native SOL mint address used across Solana operations. */
export const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";
