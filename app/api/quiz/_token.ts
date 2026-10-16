import { createHash } from "node:crypto";
import { newNonce, signToken, verifyToken } from "@/lib/signed-token";

/**
 * Signed proof that the server scored a quiz attempt. Issued by /submit, required by /certificate.
 * Bound to quiz id + rounded score + normalised student name and carries a nonce; the certificate
 * route burns the nonce (rate_limit_hit, max 1) so one passed attempt archives exactly one PDF.
 * Secret: see lib/signed-token.ts.
 */
const TTL_MS = 2 * 60 * 60 * 1000;

export const nameHash = (name: string) => createHash("sha256").update(name.trim().toLowerCase().replace(/\s+/g, " ")).digest("base64url").slice(0, 22);

export function issueCertToken(quizId: string, scorePercent: number, passed: boolean, name: string): string | undefined {
  if (!passed) return undefined;
  return signToken("cert", { q: quizId, s: Math.round(scorePercent), e: Date.now() + TTL_MS, p: true, h: nameHash(name), n: newNonce() });
}

/** Returns the single-use nonce when the token is valid for this quiz/score/name, otherwise null. */
export function verifyCertToken(token: string, quizId: string, scorePercent: number, name: string): string | null {
  const p = verifyToken<{ q: string; s: number; e: number; p: boolean; h: string; n: string }>("cert", token);
  if (!p) return null;
  const ok = p.p === true && p.q === quizId && p.s === Math.round(scorePercent) && p.e > Date.now() && p.h === nameHash(name) && typeof p.n === "string" && p.n.length > 5;
  return ok ? p.n : null;
}

/** Quiz start proof: { q, t } signed when the student presses "start". */
export function issueStartToken(quizId: string): string {
  return signToken("quizstart", { q: quizId, t: Date.now(), n: newNonce() });
}

/** Nonce inside a valid start token (null for old tokens without one). */
export function startNonceOf(token: string | undefined, quizId: string): string | null {
  if (!token) return null;
  const p = verifyToken<{ q: string; n?: string }>("quizstart", token);
  return p && p.q === quizId && typeof p.n === "string" && p.n.length > 5 ? p.n : null;
}

/** Elapsed seconds since the start token was issued, or null when invalid / for another quiz. */
export function elapsedSeconds(token: string | undefined, quizId: string): number | null {
  if (!token) return null;
  const p = verifyToken<{ q: string; t: number }>("quizstart", token);
  if (!p || p.q !== quizId || typeof p.t !== "number") return null;
  const s = Math.round((Date.now() - p.t) / 1000);
  return s >= 0 && s <= 24 * 3600 ? s : null;
}
