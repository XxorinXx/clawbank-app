"use node";

import crypto from "node:crypto";

export function base64urlEncode(data: Uint8Array): string {
  return Buffer.from(data).toString("base64url");
}

export function base64urlDecode(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, "base64url"));
}

export function sha256Base64url(data: string): string {
  const hash = crypto.createHash("sha256").update(data).digest();
  return base64urlEncode(hash);
}

interface DPoPVerifyResult {
  valid: boolean;
  error?: string;
  payload?: {
    htm: string;
    htu: string;
    iat: number;
    jti: string;
    ath: string;
  };
}

const ED25519_DER_PREFIX = Buffer.from(
  "302a300506032b6570032100",
  "hex",
);

export function verifyDPoPProof(
  jwt: string,
  publicKeyBase64url: string,
  expectedMethod: string,
  expectedUrl: string,
  accessToken: string,
): DPoPVerifyResult {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) {
      return { valid: false, error: "Invalid JWT format" };
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Decode and verify header
    const header = JSON.parse(
      Buffer.from(headerB64, "base64url").toString(),
    );
    if (header.typ !== "dpop+jwt") {
      return { valid: false, error: "Invalid typ: expected dpop+jwt" };
    }
    if (header.alg !== "EdDSA") {
      return { valid: false, error: "Invalid alg: expected EdDSA" };
    }

    // Decode payload
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString(),
    );

    // Verify htm
    if (payload.htm !== expectedMethod) {
      return {
        valid: false,
        error: `htm mismatch: expected ${expectedMethod}, got ${payload.htm}`,
      };
    }

    // Verify htu
    if (payload.htu !== expectedUrl) {
      return {
        valid: false,
        error: `htu mismatch: expected ${expectedUrl}, got ${payload.htu}`,
      };
    }

    // Verify iat within 30 seconds
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - payload.iat) > 30) {
      return { valid: false, error: "DPoP proof expired or clock skew too large" };
    }

    // Verify ath (access token hash)
    const expectedAth = sha256Base64url(accessToken);
    if (payload.ath !== expectedAth) {
      return { valid: false, error: "ath mismatch" };
    }

    // Verify Ed25519 signature
    const rawKey = base64urlDecode(publicKeyBase64url);
    if (rawKey.length !== 32) {
      return { valid: false, error: "Invalid public key length" };
    }

    const derKey = Buffer.concat([ED25519_DER_PREFIX, rawKey]);
    const publicKeyObj = crypto.createPublicKey({
      key: derKey,
      format: "der",
      type: "spki",
    });

    const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);
    const signatureBytes = base64urlDecode(signatureB64);

    const valid = crypto.verify(
      null,
      signingInput,
      publicKeyObj,
      signatureBytes,
    );

    if (!valid) {
      return { valid: false, error: "Signature verification failed" };
    }

    return {
      valid: true,
      payload: {
        htm: payload.htm,
        htu: payload.htu,
        iat: payload.iat,
        jti: payload.jti,
        ath: payload.ath,
      },
    };
  } catch (e) {
    return { valid: false, error: `DPoP verification error: ${(e as Error).message}` };
  }
}
