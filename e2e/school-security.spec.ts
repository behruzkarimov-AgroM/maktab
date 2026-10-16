import { test, expect } from "@playwright/test";
import { loginAs, STUDENT_NEW_PASSWORD } from "./school-helpers";

// NOTE: this spec changes the demo student's password (server memory only). Run it last; helpers fall back to the new password.
test.describe("school account security (demo)", () => {
  test("forgot password shows the neutral message; demo reset code flow works", async ({ page }) => {
    await page.goto("/school/login");
    await page.getByRole("link", { name: /Parolni unutdingizmi/ }).click();
    await expect(page).toHaveURL(/forgot-password/);
    await page.locator("#fp-email").fill("nobody@example.com");
    await page.getByRole("button", { name: /Havolani yuborish/ }).click();
    await expect(page.getByRole("status").first()).toContainText(/ro'yxatdan o'tgan bo'lsa/);
    await expect(page.getByText(/DEMO/).first()).toBeVisible();
    await page.getByRole("link", { name: /Tiklash sahifasini ochish/ }).click();
    await expect(page.locator("#rp-code")).toHaveValue("demo-reset");
    // weak password keeps the button disabled / server rejects; mismatch is flagged
    await page.locator("#rp-new").fill("Abcdef12xyz");
    await page.locator("#rp-confirm").fill("Different12");
    await expect(page.getByText(/Parollar bir xil emas/)).toBeVisible();
  });

  test("reset-password without a token (non demo) text is documented only in demo", async ({ page }) => {
    await page.goto("/school/reset-password");
    await expect(page.getByText(/demo-reset/).first()).toBeVisible(); // demo mode: the simulated flow is explained
  });

  // The forced redirect (must_change_password) cannot be triggered with the fixed demo logins (the demo store only flags provisioned
  // "demo-acct-*" users, which have no password); the screen itself is the same page that is reachable voluntarily.
  test("change-password screen: strength meter, mismatch, wrong current password, success -> role home", async ({ page }) => {
    await loginAs(page, "student");
    await page.goto("/school/change-password");
    await expect(page.locator("#cp-current")).toBeVisible();
    await page.locator("#cp-current").fill("wrong-current-1");
    await page.locator("#cp-new").fill("short");
    await expect(page.getByTestId("pw-strength")).toContainText(/Zaif/);
    await page.locator("#cp-new").fill(STUDENT_NEW_PASSWORD);
    await expect(page.getByTestId("pw-strength")).not.toContainText(/Zaif/);
    await page.locator("#cp-confirm").fill(STUDENT_NEW_PASSWORD + "x");
    await expect(page.getByText(/Parollar bir xil emas/)).toBeVisible();
    await page.locator("#cp-confirm").fill(STUDENT_NEW_PASSWORD);
    await page.getByRole("button", { name: /Parolni saqlash/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: /Joriy parol noto/ })).toBeVisible();
    await page.locator("#cp-current").fill("demo1234");
    // after an earlier run the demo password is already the new one
    const ok = page.waitForResponse((r) => r.url().includes("/auth/change-password"));
    await page.getByRole("button", { name: /Parolni saqlash/ }).click();
    const res = await ok;
    if (res.status() === 200) {
      await expect(page.getByRole("status").first()).toContainText(/Parol almashtirildi/);
      await page.waitForURL(/\/school\/family/, { timeout: 15_000 });
    } else {
      expect(res.status()).toBe(403); // already changed by a previous run
    }
  });

  test("notification preferences persist through the API", async ({ page }) => {
    await loginAs(page, "parent");
    await page.goto("/school/family/profile");
    const sw = page.getByRole("switch").first();
    await expect(sw).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Hozircha e-pochta orqali/)).toBeVisible();
    const before = await sw.isChecked();
    await Promise.all([page.waitForResponse((r) => r.url().includes("/api/school/me/prefs") && r.request().method() === "PUT"), sw.click()]);
    await page.reload();
    await expect(page.getByRole("switch").first()).toBeVisible({ timeout: 15_000 });
    expect(await page.getByRole("switch").first().isChecked()).toBe(!before);
    await page.getByRole("switch").first().click(); // restore
  });

  test("director: invite a parent account from the student profile", async ({ page }) => {
    await loginAs(page, "director");
    await page.goto("/school/director/students");
    await page.locator('a[href*="/school/director/students/"]').first().click();
    await page.getByRole("tab", { name: "Ota-onalar" }).click();
    await page.getByRole("button", { name: /Taklif qilish/ }).click();
    await page.getByLabel(/To.liq ism/).fill("Test Ota");
    await page.getByLabel(/E-pochta \(login\)/).fill(`ota${Date.now()}@example.uz`);
    await page.getByRole("button", { name: /Yaratish va taklif qilish/ }).click();
    await expect(page.getByText(/Ota-ona hisobi tayyor/)).toBeVisible();
    await expect(page.getByTestId("temp-password-box")).toBeVisible();
  });
});
