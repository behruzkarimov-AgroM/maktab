import { expect, type Page } from "@playwright/test";

export type DemoRole = "teacher" | "parent" | "student" | "director";
export const DEMO_EMAIL: Record<DemoRole, string> = {
  teacher: "teacher@demo.uz", parent: "parent@demo.uz", student: "student@demo.uz", director: "director@demo.uz",
};
/** the password the account-security spec leaves the demo student with (demo1234 cannot be restored: it is on the common-password list) */
export const STUDENT_NEW_PASSWORD = "Sinov2026Parol";

/** login is rate limited (10 / 10 min per IP): the session cookie of each role is reused across tests of one run */
const cookieCache = new Map<DemoRole, Parameters<ReturnType<Page["context"]>["addCookies"]>[0]>();

/** Signs in through the login form. Tries the stock demo password, then the one set by school-security.spec.ts. */
export async function loginAs(page: Page, role: DemoRole, opts: { expectHome?: RegExp | false; fresh?: boolean } = {}): Promise<void> {
  const cached = cookieCache.get(role);
  if (cached && !opts.fresh) {
    await page.context().addCookies(cached);
    const probe = await page.request.get("/api/school/me");
    if (probe.ok()) return;
  }
  const passwords = role === "student" ? ["demo1234", STUDENT_NEW_PASSWORD] : ["demo1234"];
  for (const pw of passwords) {
    await page.goto("/school/login");
    await page.waitForLoadState("networkidle");
    await page.locator("#email").fill(DEMO_EMAIL[role]);
    await page.locator("#password").fill(pw);
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/school/auth/login")),
      page.locator("form button[type=submit]").click(),
    ]);
    if (resp.status() === 200) {
      cookieCache.set(role, (await page.context().cookies()).filter((c) => c.name === "school_demo_session"));
      if (opts.expectHome !== false) await page.waitForURL(opts.expectHome ?? /\/school\/(director|teacher|family|change-password)/);
      return;
    }
  }
  expect(false, `login failed for ${role}`).toBe(true);
}
