import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Small HMAC-signed JSON tokens (server-issued proof of an earlier step, e.g. "game started at T",
 * "quiz attempt scored X"). Secret: TOKEN_SECRET, CERT_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY; in
 * DEMO mode (none set) a random per-process secret is used, so tokens only live as long as the process.
 */
const g = globalThis as unknown as { __tokSecret?: string };

function secret(): string {
  return process.env.TOKEN_SECRET || process.env.CERT_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || (g.__tokSecret ??= randomBytes(32).toString("hex"));
}

const sign = (purpose: string, body: string) => createHmac("sha256", secret()).update(`${purpose}.${body}`).digest("base64url");

export function signToken(purpose: string, payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(purpose, body)}`;
}

/** Returns the payload when the signature is valid, otherwise null. Expiry is the caller's job. */
export function verifyToken<T extends Record<string, unknown>>(purpose: string, token: unknown): T | null {
  if (typeof token !== "string" || token.length > 600) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(purpose, body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export const newNonce = () => randomBytes(12).toString("base64url");
