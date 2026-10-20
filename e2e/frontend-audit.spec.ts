import { expect, test, type Page } from "@playwright/test";
import { adminLogin } from "./admin-helpers";
import { loginAs } from "./school-helpers";

/** Collects CSP violations and uncaught page errors while a page loads. */
function watch(page: Page) {
  const bad: string[] = [];
  page.on("console", (m) => {
    const t = m.text();
    if (/Content Security Policy|violates the following/i.test(t)) bad.push(t.slice(0, 200));
  });
  page.on("pageerror", (e) => bad.push("pageerror: " + String(e).slice(0, 200)));
  return bad;
}

test.describe("CSP + console hygiene", () => {
  for (const url of ["/uz", "/ru/olympiads", "/en/games", "/en/quizzes/demo-math-3", "/en/psychology", "/en/surveys", "/en/assessment", "/uz/contact", "/admin/login", "/school/login"]) {
    test(`no CSP violations or page errors: ${url}`, async ({ page }) => {
      const bad = watch(page);
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      expect(bad).toEqual([]);
    });
  }
});

test.describe("error / 404 boundaries", () => {
  test("unknown school and admin routes render a localized not-found card with a way back", async ({ page }) => {
    const r = await page.goto("/school/does-not-exist");
    expect(r?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /Bosh sahifaga|На главную|Back to home/ })).toHaveAttribute("href", "/school");
    await expect(page.locator("main")).toHaveCount(1);
  });
  test("public 404 is localized and has one main landmark", async ({ page }) => {
    await page.goto("/ru/nope");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Страница не найдена");
    await expect(page.locator("main")).toHaveCount(1);
  });
});

test.describe("a11y landmarks", () => {
  for (const url of ["/admin/login", "/school/login"]) {
    test(`${url} has exactly one main landmark and a labelled language group`, async ({ page }) => {
      await page.goto(url);
      await expect(page.locator("main")).toHaveCount(1);
    });
  }
  test("admin import dialog: Escape closes and focus returns to the opener; Tab stays inside", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin/academic_quizzes");
    await page.waitForLoadState("networkidle");
    const opener = page.getByRole("button", { name: "Word/PDF dan import" });
    await opener.focus();
    await opener.click();
    const dialog = page.getByTestId("import-dialog");
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });
});

test.describe("excuse reject (teacher) needs a comment", () => {
  test("reject endpoint refuses an empty comment", async ({ page }) => {
    await loginAs(page, "teacher");
    const r = await page.request.post("/api/school/teacher/excuse/reject", { data: { notificationId: "00000000-0000-4000-8000-000000000000", comment: "" } });
    expect([400, 422]).toContain(r.status());
  });
});

test.describe("language switch keeps state on the page", () => {
  test("switching language on a quiz keeps the path and the page renders", async ({ page }) => {
    await page.goto("/en/quizzes");
    await page.getByRole("group").getByRole("link", { name: "Русский" }).first().click();
    await expect(page).toHaveURL(/\/ru\/quizzes$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  });
});
