/**
 * HMAC-SHA256 helpers built on WebCrypto, available in the Convex runtime
 * (no Node builtins required). Used to sign outbound webhook payloads to
 * n8n and to verify inbound calls from n8n.
 */

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function hmacSign(secret: string, payload: string): Promise<string> {
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return hex(sig);
}

/**
 * Verification goes through crypto.subtle.verify, which compares in
 * constant time inside the runtime rather than via a JS string compare.
 */
export async function hmacVerify(
  secret: string,
  payload: string,
  signatureHex: string,
): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/i.test(signatureHex)) return false;
  const key = await importKey(secret);
  const bytes = new Uint8Array(
    signatureHex.match(/../g)!.map((h) => parseInt(h, 16)),
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    bytes.buffer as ArrayBuffer,
    new TextEncoder().encode(payload),
  );
}

/**
 * Signed envelope: the timestamp is part of the signed payload so n8n can
 * reject stale requests (replay protection) in addition to bad signatures.
 */
export async function signedBody(
  secret: string,
  data: Record<string, unknown>,
): Promise<string> {
  const body = JSON.stringify({ ...data, timestamp: Date.now() });
  const signature = await hmacSign(secret, body);
  return JSON.stringify({ body, signature });
}

export const MAX_SKEW_MS = 5 * 60 * 1000;

export async function verifySignedBody(
  secret: string,
  raw: string,
): Promise<Record<string, unknown> | null> {
  let envelope: { body?: string; signature?: string };
  try {
    envelope = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof envelope.body !== "string" || typeof envelope.signature !== "string") {
    return null;
  }
  if (!(await hmacVerify(secret, envelope.body, envelope.signature))) {
    return null;
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(envelope.body);
  } catch {
    return null;
  }
  const ts = data.timestamp;
  if (typeof ts !== "number" || Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
    return null;
  }
  return data;
}
