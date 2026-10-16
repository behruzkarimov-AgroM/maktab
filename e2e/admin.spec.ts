import { test, expect, type Page } from "@playwright/test";

async function adminLogin(page: Page, email = "admin@demo.uz") {
  await page.goto("/admin/login");
  await page.waitForLoadState("networkidle"); // wait for hydration, otherwise the form submits natively
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("demo1234");
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/admin/auth/login")),
    page.locator("form button[type=submit]").last().click(),
  ]);
  expect(resp.status()).toBe(200);
  // Land on a page that works regardless of the /admin dashboard bug below.
  await page.goto("/admin/programs");
}

test.describe("admin (demo login)", () => {
  test("anonymous access to /admin is redirected to login; admin API is 401", async ({ page, request }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
    expect((await request.get("/api/admin/programs")).status()).toBe(401);
    expect((await request.post("/api/admin/programs", { data: {} })).status()).toBe(401);
  });

  test("wrong password is rejected", async ({ page }) => {
    await page.goto("/admin/login");
    await page.locator("#email").fill("admin@demo.uz");
    await page.locator("#password").fill("nope-nope");
    await page.locator("form button[type=submit]").last().click();
    // Next.js renders its own empty route-announcer with role=alert; target the form error only.
    await expect(page.locator("p[role=alert]")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("login -> dashboard at /admin renders with charts", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin");
    await page.waitForTimeout(2000);
    expect(new URL(page.url()).pathname).toBe("/admin");
    await expect(page.locator("svg.recharts-surface").first()).toBeVisible({ timeout: 15_000 });
  });

  test("dashboard data API works for a logged-in admin", async ({ page }) => {
    await adminLogin(page);
    const r = await page.request.get("/api/admin/dashboard");
    expect(r.status()).toBe(200);
  });
  test("create a trilingual program and see it in the list", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/programs");
    await page.getByRole("button", { name: "Yangi qo'shish" }).click();

    const title = page.locator("#f-title");
    const wrap = title.locator("xpath=..");
    const stamp = Date.now().toString().slice(-6);
    await title.fill(`E2E dastur ${stamp}`);
    await wrap.getByRole("tab", { name: /^ru/i }).click();
    await title.fill(`E2E программа ${stamp}`);
    await wrap.getByRole("tab", { name: /^en/i }).click();
    await title.fill(`E2E program ${stamp}`);

    const desc = page.locator("#f-short_description");
    const dwrap = desc.locator("xpath=..");
    await desc.fill("Qisqa tavsif");
    await dwrap.getByRole("tab", { name: /^ru/i }).click();
    await desc.fill("Краткое описание");
    await dwrap.getByRole("tab", { name: /^en/i }).click();
    await desc.fill("Short description");

    await page.locator("#f-category").selectOption({ index: 1 });
    const gr = page.locator("#f-grade_range");
    if (await gr.isVisible()) await gr.fill("5-9");
    await page.getByRole("button", { name: "Saqlash" }).click();

    await expect(page.getByText(`E2E dastur ${stamp}`).first()).toBeVisible({ timeout: 10_000 });
    // the RU / EN values were stored too
    const rows = await page.request.get("/api/admin/programs");
    expect(rows.status()).toBe(200);
    const json = JSON.stringify(await rows.json());
    expect(json).toContain(`E2E программа ${stamp}`);
    expect(json).toContain(`E2E program ${stamp}`);
  });

  test("validation: saving an empty program is refused by the API", async ({ page }) => {
    await adminLogin(page);
    const r = await page.request.post("/api/admin/programs", { data: { title: { uz: "", ru: "", en: "" } } });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test("role restriction: psychologist cannot write programs", async ({ page }) => {
    await adminLogin(page, "psixolog@demo.uz");
    const r = await page.request.post("/api/admin/programs", { data: { title: { uz: "x", ru: "", en: "" }, category: "primary" } });
    expect(r.status()).toBe(403);
  });
});





