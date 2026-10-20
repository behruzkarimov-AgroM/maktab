/* eslint-disable @typescript-eslint/no-explicit-any */
// Phone verification through the Telegram bot, end to end on the self-hosted database (PGlite + real schema): the bot stores a shared
// phone and auto-links a matching account; the site sends codes to that chat for sign-in by phone, self-registration and forms.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalGateway } from "@/lib/localdb/gateway";
import { buildLocalDb } from "./helpers/local-fixture";

const jar = vi.hoisted(() => new Map<string, string>());
const outbox = vi.hoisted(() => [] as { chat: string; text: string }[]);
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (n: string, v: string, o?: { maxAge?: number }) => (o?.maxAge === 0 || v === "" ? jar.delete(n) : jar.set(n, v)),
    delete: (n: string) => jar.delete(n),
  }),
  headers: async () => new Headers(),
}));
// next/server after() (used by the admission route for notifications) needs a request scope: run the callback inline
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void Promise.resolve().then(fn).catch(() => undefined) }));
// Telegram delivery captured: the test reads the code the way the user reads it in the bot
vi.mock("@/lib/telegram", () => ({
  escapeHtml: (s: string) => s,
  sendTelegram: async (text: string, chat?: string) => {
    outbox.push({ chat: String(chat), text });
    return true;
  },
}));

let gw: LocalGateway;
let close: () => Promise<void>;
let dir: string;
const SECRET = "b".repeat(40);
const SITE = "http://localhost";
const req = (path: string, init: RequestInit & { chat?: string } = {}) =>
  new Request(`${SITE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json", host: "localhost", origin: SITE,
      ...(init.chat ? { "x-bot-secret": SECRET, "x-telegram-chat-id": init.chat } : {}),
    },
  });
const post = (path: string, body: unknown, chat?: string) => req(path, { method: "POST", body: JSON.stringify(body), chat });
const lastCode = (chat: string) => /<b>(\d{6})<\/b>/.exec([...outbox].reverse().find((m) => m.chat === chat)?.text ?? "")?.[1] ?? "";

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ca-phone-"));
  const built = await buildLocalDb(dir);
  gw = built.gw;
  close = () => built.db.close();
  Object.assign(process.env, {
    DATABASE_URL: "postgres://local/test", AUTH_SECRET: "a".repeat(48), UPLOAD_DIR: dir, BOT_API_SECRET: SECRET,
    TELEGRAM_BOT_TOKEN: "123456:" + "T".repeat(35), TELEGRAM_BOT_USERNAME: "maktab_test_bot",
  });
  (globalThis as any).__localGateway = gw;
}, 120_000);
afterAll(async () => {
  for (const k of ["DATABASE_URL", "AUTH_SECRET", "UPLOAD_DIR", "BOT_API_SECRET", "TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME"]) delete process.env[k];
  delete (globalThis as any).__localGateway;
  await close?.();
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  jar.clear();
  outbox.length = 0;
});

/** a parent account whose guardian record carries `phone` (written the way people type it) */
async function parent(email: string, phone: string) {
  const { localService } = await import("@/lib/localdb/server");
  const svc = localService();
  const { data } = await svc.auth.admin.createUser({ email, password: "Parent-pass-1" });
  await svc.from("profiles").update({ role: "parent", full_name: "Ota Ona", must_change_password: true }).eq("id", data.user.id);
  await svc.from("guardians").insert({ full_name: "Ota Ona", relation: "parent", phone, user_id: data.user.id });
  return data.user.id as string;
}

describe("bot: shared phone", () => {
  it("a phone on a guardian record links the chat to that parent at once; an unknown phone is only stored", async () => {
    const uid = await parent("p1@school.uz", "90 111 22 33");
    const route = await import("@/app/api/bot/phone/route");
    expect((await route.POST(post("/api/bot/phone", { phone: "+998901112233" }))).status).toBe(404); // no bot secret
    const r = await (await route.POST(post("/api/bot/phone", { phone: "+998 90 111-22-33" }, "5550001"))).json();
    expect(r).toMatchObject({ phone: "+998901112233", linked: true, role: "parent" });
    const { userForChat } = await import("@/lib/telegram-links");
    expect(await userForChat("5550001")).toBe(uid);
    const me = await import("@/app/api/school/me/route");
    expect((await (await me.GET(req("/api/school/me", { chat: "5550001" }))).json()).user.id).toBe(uid);

    expect(await (await route.POST(post("/api/bot/phone", { phone: "+998935550000" }, "5550002"))).json()).toMatchObject({ linked: false });
    expect(await (await route.GET(req("/api/bot/phone", { chat: "5550002" }))).json()).toMatchObject({ phone: "+998935550000", linked: false });
  });
});

describe("site: sign-in by phone", () => {
  it("unknown chat -> no_telegram; code goes to the bot chat; wrong code fails; right code signs in once and clears the temp password", async () => {
    const uid = await parent("p2@school.uz", "+998 97 000 11 22");
    const request = await import("@/app/api/auth/phone/request/route");
    const verify = await import("@/app/api/auth/phone/verify/route");
    const noChat = await request.POST(post("/api/auth/phone/request", { phone: "+998970001122", purpose: "login" }));
    expect(noChat.status).toBe(409);
    expect(await noChat.json()).toMatchObject({ error: "no_telegram", bot: "maktab_test_bot" });

    const bot = await import("@/app/api/bot/phone/route");
    await bot.POST(post("/api/bot/phone", { phone: "998970001122" }, "5550003"));
    expect((await request.POST(post("/api/auth/phone/request", { phone: "97 000 11 22", purpose: "login" }))).status).toBe(200);
    const code = lastCode("5550003");
    expect(code).toMatch(/^\d{6}$/);

    expect((await verify.POST(post("/api/auth/phone/verify", { phone: "+998970001122", purpose: "login", code: code === "000000" ? "111111" : "000000" }))).status).toBe(422);
    const ok = await verify.POST(post("/api/auth/phone/verify", { phone: "+998970001122", purpose: "login", code }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ redirect: "/school/family" });
    expect(jar.has("ca_session")).toBe(true);
    const me = await import("@/app/api/school/me/route");
    expect(await (await me.GET(req("/api/school/me"))).json()).toMatchObject({ user: { id: uid, role: "parent" }, must_change_password: false });
    jar.clear();
    expect((await verify.POST(post("/api/auth/phone/verify", { phone: "+998970001122", purpose: "login", code }))).status).toBe(422); // single use
  });

  it("5 wrong guesses burn the code; a phone without an account cannot request a login code", async () => {
    await parent("p3@school.uz", "+998971112233");
    const bot = await import("@/app/api/bot/phone/route");
    await bot.POST(post("/api/bot/phone", { phone: "+998971112233" }, "5550004"));
    const request = await import("@/app/api/auth/phone/request/route");
    const verify = await import("@/app/api/auth/phone/verify/route");
    await request.POST(post("/api/auth/phone/request", { phone: "+998971112233", purpose: "login" }));
    const code = lastCode("5550004");
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
    for (let i = 0; i < 5; i++) await verify.POST(post("/api/auth/phone/verify", { phone: "+998971112233", purpose: "login", code: wrong }));
    expect((await verify.POST(post("/api/auth/phone/verify", { phone: "+998971112233", purpose: "login", code }))).status).toBe(422);

    await bot.POST(post("/api/bot/phone", { phone: "+998939990000" }, "5550005"));
    expect((await request.POST(post("/api/auth/phone/request", { phone: "+998939990000", purpose: "login" }))).status).toBe(404);
  });
});

describe("site: self-registration", () => {
  it("verified phone -> parent account + guardian record + linked bot chat + signed in; the same phone cannot register twice", async () => {
    const bot = await import("@/app/api/bot/phone/route");
    await bot.POST(post("/api/bot/phone", { phone: "+998917778899" }, "5550006"));
    const request = await import("@/app/api/auth/phone/request/route");
    const verify = await import("@/app/api/auth/phone/verify/route");
    const signup = await import("@/app/api/auth/signup/route");
    expect((await request.POST(post("/api/auth/phone/request", { phone: "+998917778899", purpose: "signup" }))).status).toBe(200);
    const v = await (await verify.POST(post("/api/auth/phone/verify", { phone: "+998917778899", purpose: "signup", code: lastCode("5550006") }))).json();
    expect(v.token).toBeTruthy();
    expect((await signup.POST(post("/api/auth/signup", { token: "x.y", full_name: "Nodira Aliyeva" }))).status).toBe(422);
    const r = await signup.POST(post("/api/auth/signup", { token: v.token, full_name: "Nodira  Aliyeva", password: "Nodira-2026-pass" }));
    expect(r.status).toBe(201);
    expect(await r.json()).toMatchObject({ redirect: "/school/family", login: expect.stringMatching(/^p998917778899@/) });
    const me = await import("@/app/api/school/me/route");
    const m = await (await me.GET(req("/api/school/me"))).json();
    expect(m.user).toMatchObject({ role: "parent", name: "Nodira Aliyeva" });
    const { userForChat } = await import("@/lib/telegram-links");
    expect(await userForChat("5550006")).toBe(m.user.id);
    // password sign-in works too
    jar.clear();
    const login = await import("@/app/api/school/auth/login/route");
    expect((await login.POST(post("/api/school/auth/login", { email: `p998917778899@childrensacademy.uz`, password: "Nodira-2026-pass" }) as any)).status).toBe(200);
    // second registration with the same phone
    expect((await request.POST(post("/api/auth/phone/request", { phone: "+998917778899", purpose: "signup" }))).status).toBe(409);
    expect((await signup.POST(post("/api/auth/signup", { token: v.token, full_name: "Boshqa Odam" }))).status).toBe(409);
  });
});

describe("forms require a verified phone once the bot is set up", () => {
  it("admission: without a token 400 phone_unverified; with a token for another phone 400; with the right token accepted; the bot itself is trusted", async () => {
    const bot = await import("@/app/api/bot/phone/route");
    await bot.POST(post("/api/bot/phone", { phone: "+998951234567" }, "5550007"));
    const request = await import("@/app/api/auth/phone/request/route");
    const verify = await import("@/app/api/auth/phone/verify/route");
    await request.POST(post("/api/auth/phone/request", { phone: "+998951234567", purpose: "verify" }));
    const { token } = await (await verify.POST(post("/api/auth/phone/verify", { phone: "+998951234567", purpose: "verify", code: lastCode("5550007") }))).json();
    const apps = await import("@/app/api/applications/route");
    const form = (phone: string, phoneToken?: string, chat?: string) =>
      post("/api/applications", { application_type: "admission", parent_name: "Ota Ona", phone, formStartedAt: Date.now() - 10_000, phoneToken }, chat);
    expect(await (await apps.POST(form("+998951234567") as any)).json()).toMatchObject({ error: "phone_unverified" });
    expect((await apps.POST(form("+998951234568", token) as any)).status).toBe(400);
    expect((await apps.POST(form("+998 95 123 45 67", token) as any)).status).toBe(200);
    expect((await apps.POST(form("+998951234569", undefined, "5550099") as any)).status).toBe(200);

    const cfg = await import("@/app/api/auth/phone/route");
    expect(await (await cfg.GET()).json()).toMatchObject({ codes: true, bot: "maktab_test_bot", login: true, signup: true, formsRequire: true });
  });
});
