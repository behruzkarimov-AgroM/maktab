import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/school/login");
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="email"], #email').first().fill("teacher@demo.uz");
  await page.locator('input[type="password"], #password').first().fill("demo1234");
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/school/auth/login") && r.status() === 200),
    page.locator("form button[type=submit]").first().click(),
  ]);
  await page.waitForURL(/\/school\/teacher/);
}

test.describe("school teacher portal (demo)", () => {
  test("mark attendance for 1A, reload, enter grades, confirm term grade", async ({ page }) => {
    await login(page);
    // attendance: 1A is not pre-marked today
    await page.goto("/school/teacher/attendance");
    await page.getByRole("combobox").first().selectOption({ label: "1A" });
    const rows = page.locator("ul[aria-label] > li");
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    await rows.first().locator("button").first().click(); // present -> absent
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/school/attendance/bulk")),
      page.getByRole("button", { name: /Saqlash/ }).click(),
    ]);
    expect(resp.status()).toBe(200);
    await page.reload();
    await expect(page.getByText(/Saqlangan/).first()).toBeVisible({ timeout: 15_000 });

    // journal: enter a grade in the first free cell
    await page.goto("/school/teacher/journal");
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });
    const addCol = page.getByRole("button", { name: "Qo'shish" });
    await addCol.click();
    const cell = page.locator('[data-cell="0-0"]');
    await cell.click();
    await page.keyboard.press("5");
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-cell="0-0"]')).toContainText("5");
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/school/grades/bulk")),
      page.getByRole("button", { name: /^Saqlash$/ }).click(),
    ]);

    // term grades: accept suggestions and confirm
    await page.getByRole("tab", { name: "Chorak baholari" }).click();
    const accept = page.getByRole("button", { name: "Takliflarni qabul qilish" });
    await expect(accept).toBeVisible({ timeout: 15_000 });
    if (await accept.isEnabled()) {
      await accept.click();
      const confirm = page.getByRole("button", { name: /^Tasdiqlash/ });
      if (await confirm.isEnabled()) {
        const [r] = await Promise.all([page.waitForResponse((x) => x.url().includes("/api/school/teacher/term-grades")), confirm.click()]);
        expect(r.status()).toBe(200);
      }
    }
  });
});
