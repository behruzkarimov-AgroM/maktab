import { test, expect } from "@playwright/test";

const LOCALES = ["uz", "ru", "en"] as const;
const ROUTES = ["", "/about", "/programs", "/campus", "/team", "/achievements", "/olympiads", "/quizzes", "/psychology", "/games", "/contact"];

test.describe("public routes", () => {
  for (const l of LOCALES) {
    test(`all routes 200 with <html lang=${l}>`, async ({ page }) => {
      for (const r of ROUTES) {
        const res = await page.goto(`/${l}${r}`);
        expect(res?.status(), `${l}${r}`).toBe(200);
        await expect(page.locator("html"), `${l}${r}`).toHaveAttribute("lang", l);
        await expect(page.locator("main, #main").first()).toBeVisible();
      }
    });
  }

  test("root redirects to a locale, unknown path gives 404 page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/(uz|ru|en)(\/|$)/);
    const res = await page.goto("/en/this-page-does-not-exist");
    expect(res?.status()).toBe(404);
  });

  test("footer links resolve (no dead internal links)", async ({ page, request }) => {
    await page.goto("/en");
    const hrefs = await page.locator("footer a[href^='/']").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")!))]);
    expect(hrefs.length).toBeGreaterThan(5);
    for (const h of hrefs) {
      const r = await request.get(h);
      expect(r.status(), h).toBe(200);
    }
  });

  test("robots, sitemap and manifest are served", async ({ request }) => {
    for (const p of ["/robots.txt", "/sitemap.xml", "/manifest.webmanifest"]) {
      expect((await request.get(p)).status(), p).toBe(200);
    }
  });
});

test.describe("language & theme", () => {
  test("language switch keeps the path", async ({ page }) => {
    await page.goto("/en/olympiads");
    await page.getByRole("group").getByRole("link", { name: "Русский" }).first().click();
    await expect(page).toHaveURL(/\/ru\/olympiads$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await page.getByRole("link", { name: "O'zbekcha" }).first().click();
    await expect(page).toHaveURL(/\/uz\/olympiads$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "uz");
  });

  test("theme toggle flips the dark class and persists across reload", async ({ page }) => {
    await page.goto("/en");
    const html = page.locator("html");
    const before = await html.evaluate((e) => e.classList.contains("dark"));
    await page.getByRole("button", { name: "Toggle theme" }).first().click();
    await expect.poll(() => html.evaluate((e) => e.classList.contains("dark"))).toBe(!before);
    await page.reload();
    await expect.poll(() => html.evaluate((e) => e.classList.contains("dark"))).toBe(!before);
  });
});

test.describe("mobile layout (375px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  for (const r of ROUTES) {
    test(`no horizontal scroll on /en${r}`, async ({ page }) => {
      await page.goto(`/en${r}`);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

test.describe("regressions (audit)", () => {
  test("no React hydration errors on key pages", async ({ page }) => {
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(e.message));
    for (const r of ["/uz", "/uz/privacy", "/uz/psychology", "/en/team"]) {
      await page.goto(r);
      await page.waitForLoadState("networkidle");
    }
    expect(errs.filter((m) => /#418|#423|#425|hydrat/i.test(m))).toEqual([]);
  });

  test("uz dates use month names, not ICU 'M10' placeholders", async ({ page }) => {
    await page.goto("/uz/olympiads");
    await page.waitForLoadState("networkidle");
    expect(await page.locator("main").innerText()).not.toMatch(/\b\d{4} M\d{2}\b/);
  });

  test("header never overflows its pill (uz, 1920)", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/uz");
    const over = await page.evaluate(() => {
      const pill = document.querySelector("header .glass-strong")!.getBoundingClientRect();
      let max = 0;
      document.querySelectorAll("header .glass-strong *").forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.width && r.right > max) max = r.right;
      });
      return max - pill.right;
    });
    expect(over).toBeLessThanOrEqual(0);
  });

  test("hero text does not overlap the school illustration (1366x768)", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/ru");
    await page.waitForTimeout(1500);
    const { content, school } = await page.evaluate(() => {
      const h1 = document.querySelector("section h1")!.closest("div.mx-auto")!.getBoundingClientRect();
      const s = document.querySelector('section svg[viewBox="-10 -40 420 320"]')!.getBoundingClientRect();
      return { content: h1.bottom, school: s.top + s.height * 0.12 };
    });
    expect(content).toBeLessThanOrEqual(school);
  });

  test("contact form masks the phone and focuses the first invalid field", async ({ page }) => {
    await page.goto("/en/contact");
    await page.fill("#ad-parent", "Test Parent");
    await page.fill("#ad-phone", "12ab345");
    await expect(page.locator("#ad-phone")).toHaveValue("+998 12 345");
    await page.locator("form button[type=submit]").click();
    await expect(page.locator("#ad-phone")).toBeFocused();
    await expect(page.locator("#ad-phone")).toHaveAttribute("aria-invalid", "true");
  });

  test("mobile drawer traps focus and returns it on Escape", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/en");
    const trigger = page.locator("header button[aria-controls$='-mobile']");
    await trigger.click();
    for (let i = 0; i < 20; i++) await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("[data-mobile-nav]"))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  });
});
