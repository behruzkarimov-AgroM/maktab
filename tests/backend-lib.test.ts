import { describe, it, expect, beforeEach } from "vitest";
import { isBotSubmission, readJson, parseBody, clientIp } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { envReport } from "@/lib/env";
import { z } from "zod";

const req = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/x", { method: "POST", body, headers: { "content-type": "application/json", ...headers } });

describe("lib/api", () => {
  it("readJson enforces size and JSON validity", async () => {
    expect((await readJson(req("{bad"))).ok).toBe(false);
    const big = await readJson(req(JSON.stringify({ a: "x".repeat(200) })), 50);
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.res.status).toBe(413);
    expect((await readJson(req('{"a":1}'))).ok).toBe(true);
  });
  it("parseBody returns field names only on validation failure", async () => {
    const r = await parseBody(req('{"name":1}'), z.object({ name: z.string() }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.res.status).toBe(422);
      expect(await r.res.json()).toEqual({ ok: false, error: "validation", fields: ["name"] });
    }
  });
  it("honeypot and time trap", () => {
    expect(isBotSubmission({ website: "http://spam" })).toBe(true);
    expect(isBotSubmission({ website: "" })).toBe(false);
    expect(isBotSubmission({ formStartedAt: Date.now() - 200 })).toBe(true);
    expect(isBotSubmission({ formStartedAt: Date.now() - 5000 })).toBe(false);
    expect(isBotSubmission({})).toBe(false);
    expect(isBotSubmission({}, { requireTimestamp: true })).toBe(true);
    expect(isBotSubmission({ formStartedAt: Date.now() - 5000 }, { requireTimestamp: true })).toBe(false);
  });
  it("clientIp trusts only platform headers (never client-controllable ones)", () => {
    expect(clientIp(req("{}", { "x-vercel-forwarded-for": "1.2.3.4, 9.9.9.9" }))).toBe("1.2.3.4");
    expect(clientIp(req("{}", { "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIp(req("{}", { "x-real-ip": "5.6.7.8", "cf-connecting-ip": "6.6.6.6", "x-forwarded-for": "7.7.7.7" }))).toBe("5.6.7.8");
    expect(clientIp(req("{}", { "cf-connecting-ip": "6.6.6.6", "x-forwarded-for": "7.7.7.7" }))).toBe("unknown");
    expect(clientIp(req("{}"))).toBe("unknown");
  });
});

describe("lib/rate-limit (memory)", () => {
  beforeEach(() => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });
  it("allows max then blocks per identity", async () => {
    const key = "t" + Math.random();
    const r = req("{}");
    const hits = [];
    for (let i = 0; i < 4; i++) hits.push((await rateLimit(r, { key, max: 3, windowSec: 60, identity: "a" })).allowed);
    expect(hits).toEqual([true, true, true, false]);
    expect((await rateLimit(r, { key, max: 3, windowSec: 60, identity: "b" })).allowed).toBe(true);
  });
});

describe("lib/env", () => {
  it("reports demo mode with no env and never throws", () => {
    const r = envReport();
    expect(["demo", "supabase"]).toContain(r.mode);
    expect(JSON.stringify(r)).not.toMatch(/eyJ|service_role/);
  });
});