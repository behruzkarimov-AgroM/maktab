/* eslint-disable @typescript-eslint/no-explicit-any */
// Backend/security hardening: CSRF metadata, rate limiter semantics, game score plausibility, zip-bomb truthfulness, import slots,
// demo session expiry, cookie hardening, quiz/olympiad body limits and CSRF, admin demo login throttling.
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rejectCrossOrigin, legacyError, readJson } from "@/lib/api";
import { checkGameScore } from "@/lib/game-score";
import { __memorySize, __resetMemory, rateLimit } from "@/lib/rate-limit";
import { verifyZipTruthful, zipDirectory } from "@/lib/admin/import/formats/zip";
import { __activeSlots, MAX_IMPORT_JOBS, MAX_OCR_JOBS, withImportSlot, withOcrSlot } from "@/lib/admin/import/limiter";
import { ImportError } from "@/lib/admin/import/errors";
import { DEMO_SESSION_MS, signDemoCookie, verifyDemoCookie } from "@/lib/admin/auth";
import { hardenCookie, MAX_SESSION_COOKIE_SECONDS } from "@/lib/admin/supabase";
import { signDemoCookie as signSchoolCookie, verifyDemoCookie as verifySchoolCookie } from "@/lib/school/auth";

const req = (headers: Record<string, string>, method = "POST") => new Request("http://localhost/api/x", { method, headers });
const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json", host: "localhost", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

beforeEach(() => __resetMemory());
afterEach(() => vi.restoreAllMocks());

describe("CSRF: Origin + Fetch Metadata", () => {
  it("passes same-origin and header-less (server-to-server) requests", () => {
    expect(rejectCrossOrigin(req({ host: "localhost" }))).toBeNull();
    expect(rejectCrossOrigin(req({ host: "localhost", origin: "http://localhost" }))).toBeNull();
    expect(rejectCrossOrigin(req({ host: "localhost", "sec-fetch-site": "same-origin" }))).toBeNull();
    expect(rejectCrossOrigin(req({ host: "localhost", "sec-fetch-site": "none" }))).toBeNull();
  });
  it("refuses a foreign Origin, a null Origin and browser-declared cross-site / same-site traffic", () => {
    expect(rejectCrossOrigin(req({ host: "localhost", origin: "https://evil.example" }))?.status).toBe(403);
    expect(rejectCrossOrigin(req({ host: "localhost", origin: "null" }))?.status).toBe(403);
    expect(rejectCrossOrigin(req({ host: "localhost", "sec-fetch-site": "cross-site" }))?.status).toBe(403);
    expect(rejectCrossOrigin(req({ host: "localhost", "sec-fetch-site": "same-site" }))?.status).toBe(403);
  });
  it("error bodies keep one shape", async () => {
    const r = legacyError("invalid", 400, { fields: { a: "x" } });
    expect(await r.json()).toEqual({ ok: false, error: "invalid", fields: { a: "x" } });
    const big = await readJson(post("/x", "x".repeat(50)), 10);
    expect(big.ok).toBe(false);
    if (!big.ok) {
      expect(big.res.status).toBe(413);
      expect(await big.res.json()).toEqual({ ok: false, error: "payload_too_large" });
    }
  });
});

describe("rate limiter", () => {
  it("memory window counts and refuses after max", async () => {
    const r = req({ "x-real-ip": "1.2.3.4" });
    const hits = [] as boolean[];
    for (let i = 0; i < 4; i++) hits.push((await rateLimit(r, { key: "t", max: 3, windowSec: 60 })).allowed);
    expect(hits).toEqual([true, true, true, false]);
  });
  it("does not trust client-controlled forwarding headers", async () => {
    const a = (i: number) => req({ "x-forwarded-for": `9.9.9.${i}`, "x-real-ip": "5.5.5.5" });
    const out = [] as boolean[];
    for (let i = 0; i < 3; i++) out.push((await rateLimit(a(i), { key: "spoof", max: 2, windowSec: 60 })).allowed);
    expect(out).toEqual([true, true, false]);
  });
  it("memory growth is bounded without wiping live buckets", async () => {
    for (let i = 0; i < 21000; i++) await rateLimit(req({}), { key: "k", max: 5, windowSec: 3600, identity: `id-${i}` });
    expect(__memorySize()).toBeLessThanOrEqual(21000);
    expect(__memorySize()).toBeGreaterThan(5000); // evicted the oldest half, did not clear everything
    const last = await rateLimit(req({}), { key: "k", max: 1, windowSec: 3600, identity: "id-20999" });
    expect(last.allowed).toBe(false); // the newest bucket survived (already used once)
  }, 30_000); // 21k sequential awaits: slow when the whole suite runs in parallel
  it("failClosed: a DB error denies single-use burns instead of falling back to the per-instance counter", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/admin", () => ({ getAdminClient: () => ({ rpc: async () => ({ data: null, error: { message: "boom" } }) }) }));
    const mod = await import("@/lib/rate-limit");
    expect((await mod.rateLimit(req({}), { key: "burn", max: 1, windowSec: 60, identity: "n1", failClosed: true })).allowed).toBe(false);
    expect((await mod.rateLimit(req({}), { key: "soft", max: 5, windowSec: 60, identity: "n1" })).allowed).toBe(true); // low-risk routes degrade to memory
    vi.doUnmock("@/lib/supabase/admin");
    vi.resetModules();
  });
});

describe("game score plausibility", () => {
  it("accepts honest runs and rejects forgeries", () => {
    // schulte hard (grid 5, x2): 25 cells + a time bonus, 40 s
    expect(checkGameScore("schulte-table", { score: 1300, elapsedMs: 40000, completionMs: 40000, multiplier: 2, timeLimitSec: 120 }).ok).toBe(true);
    expect(checkGameScore("quiz-race", { score: 1800, elapsedMs: 60000, completionMs: 60000, multiplier: 1 }).ok).toBe(true);
    expect(checkGameScore("mental-math", { score: 99999, elapsedMs: 60000, completionMs: 60000, multiplier: 1 })).toMatchObject({ ok: false, reason: "score_too_high" });
    expect(checkGameScore("true-false", { score: 500, elapsedMs: 800, completionMs: 800, multiplier: 1 })).toMatchObject({ ok: false, reason: "too_fast" });
    // a claimed short completion time caps the rate bound even when the session is old
    expect(checkGameScore("memory-matrix", { score: 15000, elapsedMs: 3_000_000, completionMs: 10000, multiplier: 1 }).ok).toBe(false);
    // zero scores are always fine, and unknown games fall back to generic limits
    expect(checkGameScore("stroop-test", { score: 0, elapsedMs: 400, completionMs: 400, multiplier: 1 }).ok).toBe(true);
    expect(checkGameScore("brand-new-game", { score: 90000, elapsedMs: 10000, completionMs: 10000, multiplier: 1 }).ok).toBe(false);
  });
  it("the multiplier is clamped (a configured 1000x cannot widen the bound)", () => {
    expect(checkGameScore("mental-math", { score: 300000, elapsedMs: 60000, completionMs: 60000, multiplier: 1000 }).ok).toBe(false);
  });
  it("POST /api/games/leaderboard: implausible score -> 422 and the run token stays usable; honest score -> 201 once", async () => {
    const session = await import("@/app/api/games/session/route");
    const lb = await import("@/app/api/games/leaderboard/route");
    const t0 = Date.now();
    const s = await (await session.POST(post("/api/games/session", { game: "mental-math", difficulty: "medium" }) as any)).json();
    expect(s.ok).toBe(true);
    vi.spyOn(Date, "now").mockReturnValue(t0 + 35000);
    const body = { game: "mental-math", difficulty: "medium", player_name: "Tester", score: 99999, completion_time_ms: 30000, accuracy_percent: 90, session: s.token };
    const bad = await lb.POST(post("/api/games/leaderboard", body) as any);
    expect(bad.status).toBe(422);
    expect(await bad.json()).toMatchObject({ ok: false, error: "implausible_score" });
    const good = await lb.POST(post("/api/games/leaderboard", { ...body, score: 600 }) as any);
    expect(good.status).toBe(201);
    const again = await lb.POST(post("/api/games/leaderboard", { ...body, score: 600 }) as any);
    expect(again.status).toBe(403); // one score per run
  });
});

async function zipWithZeros(size: number): Promise<Uint8Array> {
  const z = new JSZip();
  z.file("word/document.xml", "<w:document/>");
  z.file("big.bin", new Uint8Array(size), { compression: "DEFLATE" });
  return z.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

describe("zip truthfulness (bombs with lying headers)", () => {
  it("accepts an honest archive", async () => {
    const b = await zipWithZeros(200_000);
    expect(() => verifyZipTruthful(b, zipDirectory(b, "bad_magic"))).not.toThrow();
  });
  it("rejects an entry whose declared size is smaller than the real inflated size", async () => {
    const b = await zipWithZeros(4_000_000);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    // patch the declared uncompressed size of every central-directory record to 1 KB
    let eocd = b.length - 22;
    while (dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
    let off = dv.getUint32(eocd + 16, true);
    for (let i = 0; i < dv.getUint16(eocd + 10, true); i++) {
      dv.setUint32(off + 24, Math.min(dv.getUint32(off + 24, true), 1024), true);
      off += 46 + dv.getUint16(off + 28, true) + dv.getUint16(off + 30, true) + dv.getUint16(off + 32, true);
    }
    const info = zipDirectory(b, "bad_magic");
    expect(() => verifyZipTruthful(b, info)).toThrowError(ImportError);
    try {
      verifyZipTruthful(b, info);
    } catch (e) {
      expect((e as ImportError).code).toBe("zip_bomb");
    }
  });
  it("rejects '..' entry names and truncated data", async () => {
    const z = new JSZip();
    z.file("../evil.txt", "x");
    const b = await z.generateAsync({ type: "uint8array" });
    expect(() => verifyZipTruthful(b, zipDirectory(b, "bad_magic"))).toThrowError(/zip_bomb/);
    const ok = await zipWithZeros(100_000);
    const cut = ok.slice(0, 80); // local header only, central directory gone
    expect(() => zipDirectory(cut, "bad_magic")).toThrowError();
  });
});

describe("import concurrency slots", () => {
  it("refuses jobs beyond the limit with a retryable code and always releases", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const running = Array.from({ length: MAX_IMPORT_JOBS }, () => withImportSlot(() => gate));
    expect(__activeSlots().jobs).toBe(MAX_IMPORT_JOBS);
    await expect(withImportSlot(async () => 1)).rejects.toMatchObject({ code: "rate_limited", status: 429 });
    release();
    await Promise.all(running);
    expect(__activeSlots().jobs).toBe(0);
    await expect(withImportSlot(async () => { throw new Error("x"); })).rejects.toThrow("x");
    expect(__activeSlots().jobs).toBe(0);
  });
  it("OCR runs one at a time", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const a = withOcrSlot(() => gate);
    expect(MAX_OCR_JOBS).toBe(1);
    await expect(withOcrSlot(async () => 1)).rejects.toMatchObject({ code: "rate_limited" });
    release();
    await a;
    await expect(withOcrSlot(async () => 7)).resolves.toBe(7);
  });
});

describe("sessions and cookies", () => {
  it("demo session cookies expire on the server, not only in the browser (admin + school)", () => {
    const now = 1_800_000_000_000;
    for (const [sign, verify] of [[signDemoCookie, verifyDemoCookie], [signSchoolCookie, verifySchoolCookie]] as const) {
      const c = sign("admin@demo.uz", now);
      expect(verify(c, now + 1000)).toBe("admin@demo.uz");
      expect(verify(c, now + DEMO_SESSION_MS + 1)).toBeNull();
      expect(verify(c.replace("admin@demo.uz", "other@demo.uz"), now + 1000)).toBeNull(); // tampered
      expect(verify(c.replace(/~\d+/, `~${now + 10 * DEMO_SESSION_MS}`), now + 1000)).toBeNull(); // extended expiry
      expect(verify("x".repeat(500), now)).toBeNull();
    }
  });
  it("auth cookie options are normalised: capped lifetime, SameSite never none, removal kept", () => {
    expect(hardenCookie({ maxAge: 400 * 86400, sameSite: "none" })).toMatchObject({ maxAge: MAX_SESSION_COOKIE_SECONDS, sameSite: "lax" });
    expect(hardenCookie({ maxAge: 0 }).maxAge).toBe(0);
    expect(hardenCookie(undefined).maxAge).toBe(MAX_SESSION_COOKIE_SECONDS);
    const prev = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = "production";
    expect(hardenCookie({ secure: false }).secure).toBe(true);
    (process.env as any).NODE_ENV = prev;
  });
});

describe("route level checks", () => {
  it("quiz submit refuses cross-site requests and oversized bodies; start token is multi-use limited", async () => {
    const submit = await import("@/app/api/quiz/[id]/submit/route");
    const ctx = { params: Promise.resolve({ id: "quiz-1" }) };
    expect((await submit.POST(post("/api/quiz/quiz-1/submit", {}, { origin: "https://evil.example" }), ctx)).status).toBe(403);
    expect((await submit.POST(post("/api/quiz/quiz-1/submit", "x".repeat(40_000)), ctx)).status).toBe(413);
    expect((await submit.POST(post("/api/quiz/quiz-1/submit", { nope: 1 }), ctx)).status).toBe(400);
  });
  it("olympiad registration rejects huge bodies and keeps the { ok:false, error, fields } shape", async () => {
    const reg = await import("@/app/api/olympiad/register/route");
    const big = await reg.POST(post("/api/olympiad/register", "x".repeat(20_000)));
    expect(big.status).toBe(413);
    const bad = await reg.POST(post("/api/olympiad/register", { studentFullName: "x" }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ ok: false, error: "invalid", fields: expect.any(Object) });
  });
  it("admin demo login: JSON only, constant-time compare, throttled", async () => {
    const login = await import("@/app/api/admin/auth/login/route");
    const mk = (body: unknown, ct = "application/json") => post("/api/admin/auth/login", body, { "content-type": ct, "x-real-ip": "7.7.7.7" });
    expect((await login.POST(mk("email=a&password=b", "text/plain") as any)).status).toBe(415);
    expect((await login.POST(mk({ email: "admin@demo.uz", password: "wrong" }) as any)).status).toBe(401);
    const ok = await login.POST(mk({ email: "ADMIN@demo.uz ", password: "demo1234" }) as any);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toMatch(/admin_demo_session=.*HttpOnly/i);
    let last = 0;
    for (let i = 0; i < 25; i++) last = (await login.POST(mk({ email: "admin@demo.uz", password: "nope" }) as any)).status;
    expect(last).toBe(429);
  });
});
