import { test, expect, type Page } from "@playwright/test";

// Director panel smoke flow (demo mode). Run against a dev or prod server: E2E_BASE_URL=http://localhost:3911 npx playwright test e2e/school-director.spec.ts

async function login(page: Page) {
  await page.addInitScript(() => localStorage.setItem("school-lang", "en"));
  await page.goto("/school/login");
  await page.waitForLoadState("networkidle");
  await page.locator("#email").fill("director@demo.uz");
  await page.locator("#password").fill("demo1234");
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/school/auth/login")),
    page.locator("form button[type=submit]").last().click(),
  ]);
  expect(resp.status()).toBe(200);
  await page.waitForURL(/\/school\/director/);
}

test.describe("school director panel", () => {
  test.setTimeout(120_000);

  test("dashboard, student search + profile, create student, schedule conflict, attendance, report", async ({ page }) => {
    await login(page);

    // dashboard
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.locator("svg.recharts-surface").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Classes missing today's attendance")).toBeVisible();

    // students: search + profile
    await page.goto("/school/director/students");
    const firstLink = page.locator("tbody a[href^='/school/director/students/']").first();
    await expect(firstLink).toBeVisible({ timeout: 20_000 });
    const fullName = (await firstLink.innerText()).trim();
    const lastName = fullName.split(" ")[0];
    await page.getByRole("textbox", { name: "Search…" }).fill(lastName);
    await expect(page.locator("tbody a", { hasText: lastName }).first()).toBeVisible();
    await page.locator("tbody a", { hasText: lastName }).first().click();
    await expect(page).toHaveURL(/\/school\/director\/students\/[0-9a-f-]{36}/);
    await expect(page.getByRole("tab", { name: "Attendance" })).toBeVisible();
    await page.getByRole("tab", { name: "Attendance" }).click();
    await expect(page.getByText("Attendance calendar")).toBeVisible();
    await page.getByRole("tab", { name: "Grades" }).click();
    await expect(page.getByText("Grades by subject and term")).toBeVisible();

    // create student
    await page.goto("/school/director/students");
    await page.getByRole("button", { name: "New student" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Last name").fill("Playwrighttest");
    await dialog.getByLabel("First name").fill("Zoya");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await page.getByRole("textbox", { name: "Search…" }).fill("Playwrighttest");
    await expect(page.locator("tbody a", { hasText: "Playwrighttest" })).toBeVisible({ timeout: 15_000 });

    // schedule conflict: move a slot onto an occupied lesson of the same class
    await page.goto("/school/director/schedule");
    const slotBtn = page.locator("tbody button:has(b)").first();
    await expect(slotBtn).toBeVisible({ timeout: 20_000 });
    await slotBtn.click();
    const sd = page.getByRole("dialog");
    const lesson = sd.getByLabel("Lesson no.");
    const cur = await lesson.inputValue();
    await lesson.selectOption(cur === "2" ? "3" : "2");
    await expect(sd.getByRole("alert")).toBeVisible();
    await expect(sd.getByRole("button", { name: "Save" })).toBeDisabled();
    await page.keyboard.press("Escape");

    // attendance overview + class sheet
    await page.goto("/school/director/attendance");
    await expect(page.getByRole("button", { name: "Open sheet" }).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Open sheet" }).first().click();
    await expect(page.getByText(/Class sheet:/)).toBeVisible();

    // report card preview for a whole class
    await page.goto("/school/director/reports");
    await page.getByLabel("For").selectOption("class");
    const classSelect = page.getByLabel("Class", { exact: true });
    await expect(classSelect.locator("option").nth(1)).toBeAttached({ timeout: 15_000 });
    await classSelect.selectOption({ index: 1 });
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByText("GPA").first()).toBeVisible({ timeout: 60_000 });
  });

  test("other director pages render without errors", async ({ page }) => {
    await login(page);
    for (const path of ["teachers", "classes", "subjects", "calendar", "grades", "announcements", "import", "audit", "settings"]) {
      await page.goto(`/school/director/${path}`);
      await expect(page.locator("main h1").first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("alert").filter({ hasText: /wrong|error/i })).toHaveCount(0);
    }
  });
});
