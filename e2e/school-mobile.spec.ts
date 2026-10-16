import { test, expect, type Page } from "@playwright/test";
import { loginAs, type DemoRole } from "./school-helpers";

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

const PAGES: Record<DemoRole, { path: string; visible: string }[]> = {
  teacher: [
    { path: "/school/teacher", visible: "main h1" },
    { path: "/school/teacher/attendance", visible: "ul[aria-label] > li, main h1" },
    { path: "/school/teacher/journal", visible: "main h1" },
    { path: "/school/teacher/classes", visible: "main h1" },
    { path: "/school/teacher/schedule", visible: "main h1" },
    { path: "/school/teacher/announcements?tab=excuses", visible: "#h-excuses" },
    { path: "/school/teacher/account", visible: "main h1" },
  ],
  parent: [
    { path: "/school/family", visible: "main" },
    { path: "/school/family/attendance", visible: "[role=grid]" },
    { path: "/school/family/grades", visible: "main h1" },
    { path: "/school/family/notifications", visible: "main h1" },
    { path: "/school/family/profile", visible: "main h1" },
  ],
  student: [
    { path: "/school/family", visible: "main" },
    { path: "/school/family/grades", visible: "main h1" },
    { path: "/school/family/profile", visible: "main h1" },
  ],
  director: [
    { path: "/school/director", visible: "main h1" },
    { path: "/school/director/students", visible: "main h1" },
    { path: "/school/director/teachers", visible: "main h1" },
    { path: "/school/director/schedule", visible: "main h1" },
    { path: "/school/director/calendar", visible: "main h1" },
    { path: "/school/director/settings", visible: "main h1" },
  ],
};

async function noHorizontalOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, "horizontal overflow (px)").toBeLessThanOrEqual(1);
}

test("login + forgot-password pages fit 375px", async ({ page }) => {
  for (const p of ["/school/login", "/school/forgot-password", "/school/reset-password?code=demo-reset"]) {
    await page.goto(p);
    await expect(page.locator("main, form").first()).toBeVisible();
    await noHorizontalOverflow(page);
  }
});

for (const role of Object.keys(PAGES) as DemoRole[]) {
  test(`${role}: pages fit 375px, header buttons are tappable`, async ({ page }) => {
    await loginAs(page, role);
    for (const p of PAGES[role]) {
      await page.goto(p.path);
      await expect(page.locator(p.visible).first()).toBeVisible({ timeout: 20_000 });
      await page.waitForLoadState("networkidle");
      await noHorizontalOverflow(page);
    }
    // top bar controls are >= 44px tap targets
    for (const name of [/Menu|Menyu|Меню/, /Chiqish|Выйти|Sign out/]) {
      const box = await page.getByRole("button", { name }).first().boundingBox();
      expect(box && box.width >= 44 && box.height >= 44, `${name} tap target`).toBeTruthy();
    }
  });
}

test("teacher attendance: row buttons and sticky bar are usable at 375px", async ({ page }) => {
  await loginAs(page, "teacher");
  await page.goto("/school/teacher/attendance");
  const first = page.locator("ul[aria-label] > li").first();
  await expect(first).toBeVisible({ timeout: 20_000 });
  const btn = await first.locator("button").first().boundingBox();
  expect(btn && btn.height >= 44).toBeTruthy();
  await expect(page.getByRole("button", { name: /Saqlash/ })).toBeVisible();
  await noHorizontalOverflow(page);
});
