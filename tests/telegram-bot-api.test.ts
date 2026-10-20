// Site side of the Telegram bot (demo mode): bot request verification, one-time link codes, bot requests acting as the linked
// portal user through the normal /api/school/* routes, per-chat rate limits. Supabase mode: tests/accounts-sim.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { botRequest } from "@/lib/bot-auth";
import { __resetMemory, rateLimit } from "@/lib/rate-limit";
import { resetDemoStore, getDemoStore } from "@/lib/school/demo-store";
import { SchoolError } from "@/lib/school/errors";
import { chatForUser, createLinkCode, demoLinks, redeemLinkCode, unlink, userForChat, LINK_CODE_TTL_MS } from "@/lib/telegram-links";

const SECRET = "s".repeat(40);
const CHAT = "123456789";
beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("BOT_API_SECRET", SECRET);
  vi.stubEnv("TELEGRAM_BOT_USERNAME", "maktab_test_bot");
  resetDemoStore("2026-10-15");
  demoLinks().links.clear();
  demoLinks().codes.clear();
  __resetMemory();
});

const botReq = (path: string, init: RequestInit & { chat?: string; secret?: string } = {}) =>
  new Request(`http://localhost${path}`, {
    ...init,
    headers: { "content-type": "application/json", host: "localhost", "x-bot-secret": init.secret ?? SECRET, "x-telegram-chat-id": init.chat ?? CHAT, ...(init.headers ?? {}) },
  });
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e: unknown) => (e instanceof SchoolError ? e.code : String(e)));

describe("bot request verification", () => {
  it("needs the exact secret (>= 32 chars) and a numeric chat id", () => {
    expect(botRequest(botReq("/x"))).toEqual({ chatId: CHAT });
    expect(botRequest(botReq("/x", { secret: SECRET.slice(1) + "x" }))).toBeNull();
    expect(botRequest(botReq("/x", { chat: "abc" }))).toBeNull();
    expect(botRequest(new Request("http://localhost/x"))).toBeNull();
    vi.stubEnv("BOT_API_SECRET", "short-secret");
    expect(botRequest(botReq("/x", { secret: "short-secret" }))).toBeNull(); // too short = bot API off
  });

  it("rate limits are counted per chat for bot requests, per IP otherwise", async () => {
    const opts = { key: "t", max: 1, windowSec: 60, store: "memory" as const };
    expect((await rateLimit(botReq("/x", { chat: "1111" }), opts)).allowed).toBe(true);
    expect((await rateLimit(botReq("/x", { chat: "2222" }), opts)).allowed).toBe(true); // another chat, same server IP
    expect((await rateLimit(botReq("/x", { chat: "1111" }), opts)).allowed).toBe(false);
  });
});

describe("link codes (demo store)", () => {
  it("a code links once, expires after 10 minutes, and replaces older codes of the same user", async () => {
    const now = Date.now();
    const old = await createLinkCode("demo-parent", now);
    const { code: c } = await createLinkCode("demo-parent", now);
    expect(c).toMatch(/^[A-Z2-9]{8}$/);
    expect(await code(redeemLinkCode(old.code, CHAT, null, now))).toBe("invalid_token");
    expect(await redeemLinkCode(c.toLowerCase(), CHAT, "ota_ona", now + 1000)).toBe("demo-parent");
    expect(await code(redeemLinkCode(c, "99999", null, now + 2000))).toBe("invalid_token"); // single use
    const late = await createLinkCode("demo-teacher", now);
    expect(await code(redeemLinkCode(late.code, "55555", null, now + LINK_CODE_TTL_MS + 1))).toBe("invalid_token");
    expect(await code(redeemLinkCode("bad!", CHAT, null, now))).toBe("invalid_token");
    expect(await userForChat(CHAT)).toBe("demo-parent");
    expect(await chatForUser("demo-parent")).toEqual({ chat_id: CHAT, username: "ota_ona" });
  });

  it("a parent's chat id reaches the guardian record (absence notices) and is cleared on unlink", async () => {
    const { code: c } = await createLinkCode("demo-parent");
    await redeemLinkCode(c, CHAT, null);
    const g = () => getDemoStore().tables.guardians.find((x) => x.user_id === "demo-parent")!;
    expect(g().telegram_chat_id).toBe(CHAT);
    expect(await unlink({ chatId: CHAT })).toBe(true);
    expect(g().telegram_chat_id).toBeNull();
    expect(await userForChat(CHAT)).toBeNull();
    expect(await unlink({ chatId: CHAT })).toBe(false);
  });

  it("one chat per user and one user per chat", async () => {
    await redeemLinkCode((await createLinkCode("demo-parent")).code, "1111", null);
    await redeemLinkCode((await createLinkCode("demo-parent")).code, "2222", null); // same user, new phone
    expect(await userForChat("1111")).toBeNull();
    await redeemLinkCode((await createLinkCode("demo-teacher")).code, "2222", null); // same chat, other account
    expect(await chatForUser("demo-parent")).toBeNull();
    expect(await userForChat("2222")).toBe("demo-teacher");
  });
});

describe("bot routes", () => {
  it("POST /api/bot/link redeems a code; wrong secret looks like 404", async () => {
    const link = await import("@/app/api/bot/link/route");
    expect((await link.POST(botReq("/api/bot/link", { method: "POST", body: JSON.stringify({ code: "AAAAAAAA" }), secret: "x".repeat(40) }))).status).toBe(404);
    expect((await link.POST(botReq("/api/bot/link", { method: "POST", body: JSON.stringify({ code: "AAAAAAAA" }) }))).status).toBe(422);
    const { code: c } = await createLinkCode("demo-teacher");
    const ok = await link.POST(botReq("/api/bot/link", { method: "POST", body: JSON.stringify({ code: c, username: "ustoz" }) }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, role: "teacher", name: "Dilnoza Karimova" });
    const out = await link.DELETE(botReq("/api/bot/link", { method: "DELETE" }));
    expect(await out.json()).toMatchObject({ ok: true, removed: true });
  });

  it("a linked chat uses the normal school API as its user, scoped like a cookie session", async () => {
    const me = await import("@/app/api/school/me/route");
    const students = await import("@/app/api/school/students/route");
    expect(await (await me.GET(botReq("/api/school/me"))).json()).toMatchObject({ ok: false, error: "not_linked" });
    await redeemLinkCode((await createLinkCode("demo-parent")).code, CHAT, null);
    const r = await (await me.GET(botReq("/api/school/me"))).json();
    expect(r.user).toMatchObject({ id: "demo-parent", role: "parent" });
    const list = await (await students.GET(botReq("/api/school/students"))).json();
    expect(list.students.map((s: { id: string }) => s.id).sort()).toEqual([...r.user.studentIds].sort()); // only own children
    // director-only endpoint stays closed for the parent's chat
    const dir = await import("@/app/api/school/director/overview/route");
    expect((await dir.GET(botReq("/api/school/director/overview"))).status).toBe(403);
  });

  it("the bot cannot mint link codes itself; the portal endpoint needs the bot username", async () => {
    await redeemLinkCode((await createLinkCode("demo-parent")).code, CHAT, null);
    const tg = await import("@/app/api/school/telegram/route");
    expect((await tg.POST(botReq("/api/school/telegram", { method: "POST" }))).status).toBe(403);
  });

  it("GET /api/public/info returns the school facts and programs", async () => {
    const info = await import("@/app/api/public/info/route");
    const j = await (await info.GET(new Request("http://localhost/api/public/info"))).json();
    expect(j.ok).toBe(true);
    expect(j.school.name.uz).toBeTruthy();
    expect(j.programs.length).toBeGreaterThan(0);
  });
});
