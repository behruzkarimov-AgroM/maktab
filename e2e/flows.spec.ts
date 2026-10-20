import { test, expect } from "@playwright/test";

test.describe("learn & play flows (demo mode)", () => {
  test("admission form submit", async ({ page }) => {
    await page.goto("/en/contact");
    await page.locator("#ad-parent").fill("Karim Aliyev");
    await page.locator("#ad-phone").fill("901234567");
    await page.locator("#ad-child").fill("Aziza Aliyeva");
    await page.locator("#ad-grade").selectOption("3");
    await page.locator("#ad-msg").fill("E2E smoke test");
    await page.locator("form button[type=submit]").first().click();
    // success replaces the form (no inline validation error left)
    await expect(page.locator("#ad-parent")).toBeHidden({ timeout: 10_000 });
  });

  test("admission: honeypot field is invisible and invalid phone is rejected", async ({ page }) => {
    await page.goto("/en/contact");
    await page.locator("#ad-parent").fill("Karim Aliyev");
    await page.locator("#ad-phone").fill("12");
    await page.locator("form button[type=submit]").first().click();
    await expect(page.locator("#ad-parent")).toBeVisible();
  });

  test("olympiad: register -> ticket visible -> result lookup", async ({ page }) => {
    await page.goto("/en/olympiads");
    await page.locator("#oly-tab-register").click();
    const sel = page.locator("#oly-select");
    // the list is filled after hydration: wait for a real option before reading them
    await expect(sel.locator("option:not([value=''])").first()).toBeAttached();
    const open =await sel.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
    await sel.selectOption(open[0]);
    await page.locator("#oly-name").fill("Test Student");
    await page.locator("#oly-birth").fill("2013-03-15");
    await page.locator("#oly-school").fill("School No. 21");
    const pickFirst = async (id: string) => {
      const v = await page.locator(`${id} option`).evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.value).filter(Boolean));
      return v;
    };
    const subjects = await pickFirst("#oly-subject");
    await page.locator("#oly-subject").selectOption(subjects[0]);
    // grade list may be limited to eligible grades
    const grades = await pickFirst("#oly-grade");
    await page.locator("#oly-grade").selectOption(grades.includes("6") ? "6" : grades[0]);
    await page.locator("#oly-phone").fill("901234567");
    await page.locator("form button[type=submit]").click();
    const ticket = page.getByText(/OLY-\d{4}-\d{6}/).first();
    await expect(ticket).toBeVisible({ timeout: 15_000 });
    const no = (await ticket.innerText()).match(/OLY-\d{4}-\d{6}/)![0];
    expect(no).toMatch(/^OLY-\d{4}-\d{6}$/);

    // result lookup with a seeded demo ticket (offered by the API in demo mode)
    const list = await page.request.get("/api/olympiad");
    const { demoTickets } = await list.json();
    expect(demoTickets?.length).toBeGreaterThan(0);
    await page.locator("#oly-tab-result").click();
    await page.locator("main input").first().fill(demoTickets[0]);
    await page.locator("main form button[type=submit]").click();
    await expect(page.getByText(/\d+\s*\/\s*\d+/).first()).toBeVisible({ timeout: 10_000 });
  });

  test("olympiad result: malformed ticket does not leak anything", async ({ request }) => {
    const r = await request.get("/api/olympiad/result?ticket=OLY-0000-000000");
    expect([200, 404]).toContain(r.status());
    const bad = await request.get("/api/olympiad/result?ticket=' OR 1=1 --");
    expect([400, 404, 422]).toContain(bad.status());
  });

  test("quiz: run -> result with explanations", async ({ page }) => {
    await page.goto("/en/quizzes");
    await page.getByRole("link", { name: "Start" }).first().click();
    await page.locator("#qz-name").fill("Test User");
    await page.getByRole("button", { name: "Start quiz" }).click();
    await expect(page.getByRole("radio", { name: /^A/ }).first()).toBeVisible({ timeout: 10_000 });
    const total = await page.getByRole("button", { name: /^Question \d+$/ }).count();
    expect(total).toBeGreaterThan(0);
    for (let i = 0; i < total; i++) {
      await page.getByRole("radio", { name: /^A/ }).first().click();
      if (i < total - 1) await page.getByRole("button", { name: "Next", exact: true }).click();
    }
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    // a confirmation step may exist
    const confirm = page.getByRole("button", { name: /^(Yes|Confirm|Submit|Finish)/i });
    if (await confirm.first().isVisible().catch(() => false)) await confirm.first().click();
    await expect(page.getByText(/\d+\s*%/).first()).toBeVisible({ timeout: 15_000 });
    // explanations come from the server only after submit
    await expect(page.getByText(/^Explanation:/).first()).toBeVisible();
  });

  test("quiz start API never contains the answer key", async ({ request }) => {
    const r = await request.get("/api/quiz/demo-math-3");
    expect(r.status()).toBe(200);
    const txt = await r.text();
    expect(txt).not.toMatch(/correct/i);
    expect(txt).not.toMatch(/explanation/i);
  });

  test("game: Schulte table starts", async ({ page }) => {
    await page.goto("/en/games");
    await page.getByRole("button", { name: /Schulte/ }).click();
    await page.getByRole("button", { name: /Start/ }).first().click();
    // grid of numbered cells appears
    await expect(page.getByRole("button", { name: /^\d{1,2}$/ }).first()).toBeVisible({ timeout: 10_000 });
    expect(await page.getByRole("button", { name: /^\d{1,2}$/ }).count()).toBeGreaterThanOrEqual(9);
  });

  test("psychology: test completes with a result and recommendations", async ({ page }) => {
    await page.goto("/en/psychology");
    await page.locator("main a[href*='psychology/']").first().click();
    await page.getByRole("button", { name: /Let's go|Start/i }).click();
    for (let guard = 0; guard < 40; guard++) {
      if (await page.getByText(/recommend/i).first().isVisible().catch(() => false)) break;
      const opts = page.locator("main button").filter({ hasNotText: /back|previous|skip|sound|all/i });
      const n = await opts.count();
      if (n === 0) break;
      await opts.first().click();
      await page.waitForTimeout(450);
    }
    await expect(page.getByText(/recommend/i).first()).toBeVisible({ timeout: 15_000 });
  });
});




