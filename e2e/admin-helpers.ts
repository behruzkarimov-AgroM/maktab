import { expect, type Page } from "@playwright/test";

/** login is rate limited (20 / 10 min per IP): the session cookie of each demo admin is reused across tests of one run */
const cookieCache = new Map<string, Parameters<ReturnType<Page["context"]>["addCookies"]>[0]>();

/** Signs in to /admin through the login form (demo mode), or reuses the cookie from an earlier login of the same account. */
export async function adminLogin(page: Page, email = "admin@demo.uz"): Promise<void> {
  const cached = cookieCache.get(email);
  if (cached) {
    await page.context().addCookies(cached);
    const probe = await page.request.get("/api/admin/dashboard");
    if (probe.ok()) return;
  }
  await page.goto("/admin/login");
  await page.waitForLoadState("networkidle"); // wait for hydration, otherwise the form submits natively
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("demo1234");
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/admin/auth/login")),
    page.locator("form button[type=submit]").last().click(),
  ]);
  expect(resp.status()).toBe(200);
  cookieCache.set(email, (await page.context().cookies()).filter((c) => c.name === "admin_demo_session"));
}
