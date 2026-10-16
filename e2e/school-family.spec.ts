import { test, expect, type Page } from "@playwright/test";

// Demo-mode flow of the parent & student cabinet. Run against a dev/prod server: E2E_BASE_URL=http://localhost:3913 npx playwright test e2e/school-family.spec.ts
async function login(page: Page, email: string) {
  await page.goto("/school/login");
  await page.waitForLoadState("networkidle");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("demo1234");
  await Promise.all([
    page.waitForURL(/\/school\/family/, { timeout: 60_000 }),
    page.locator("form button[type=submit]").click(),
  ]);
}

test.describe("school family cabinet", () => {
  test.setTimeout(120_000);

  test("parent: switch child, attendance calendar, grades, report card download", async ({ page }) => {
    await login(page, "parent@demo.uz");
    const group = page.getByRole("group", { name: /Farzandni tanlang/ });
    await expect(group.getByRole("button")).toHaveCount(2, { timeout: 60_000 });
    const second = group.getByRole("button").nth(1);
    await second.click();
    await expect(second).toHaveAttribute("aria-pressed", "true");

    await page.goto("/school/family/attendance");
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByLabel("Belgilar")).toBeVisible();

    await page.goto("/school/family/grades");
    await expect(page.getByText(/Chorak va yillik baholar/)).toBeVisible({ timeout: 60_000 });

    await page.goto("/school/family/report-card");
    const btn = page.getByRole("button", { name: /PDF yuklab olish/ });
    await expect(btn).toBeEnabled({ timeout: 60_000 });
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), btn.click()]);
    expect(dl.suggestedFilename()).toMatch(/\.pdf$/);
  });

  test("student sees only own data and cannot open the director area", async ({ page }) => {
    await login(page, "student@demo.uz");
    await expect(page.getByRole("group", { name: /Farzandni tanlang/ })).toHaveCount(0);
    const res = await page.request.get("/api/school/students");
    const json = (await res.json()) as { students: { id: string }[] };
    expect(json.students).toHaveLength(1);
    const other = await page.request.get("/api/school/students/00000000-0000-4000-8000-000000000001");
    expect([403, 404]).toContain(other.status());
    await page.goto("/school/director");
    await expect(page).toHaveURL(/\/school\/family/);
  });
});
