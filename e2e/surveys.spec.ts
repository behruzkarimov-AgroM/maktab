import { test, expect, type Page } from "@playwright/test";
import { adminLogin } from "./admin-helpers";

async function responseCount(page: Page, id: string): Promise<number> {
  await page.goto(`/admin/surveys/${id}/results`);
  const el = page.getByTestId("response-count");
  await expect(el).toBeVisible({ timeout: 20_000 });
  return Number((await el.textContent())?.trim());
}

/** Answers every question of the parents survey; the sample has 6 questions, the last (text) is optional. */
async function completeParentsSurvey(page: Page) {
  await page.getByRole("button", { name: /Boshlaymiz/ }).click();
  const next = page.getByRole("button", { name: /Keyingi|Yuborish/ });
  // 1 scale
  await page.getByRole("radio", { name: "5", exact: true }).click();
  await next.click();
  // 2 single
  await page.getByRole("radio").first().click();
  await next.click();
  // 3 multiple
  await page.getByRole("checkbox").nth(0).click();
  await page.getByRole("checkbox").nth(2).click();
  await next.click();
  // 4 scale
  await page.getByRole("radio", { name: "4", exact: true }).click();
  await next.click();
  // 5 yes/no
  await page.getByRole("radio", { name: /Ha/ }).click();
  await next.click();
  // 6 optional text
  await page.getByRole("textbox").fill("E2E: more sport clubs, please");
  // the bot trap treats a form filled in under ~1.2 s as automated; a person never is
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /Yuborish/ }).click();
}

test.describe("surveys (demo mode)", () => {
  test("list page shows the sample surveys and the nav link", async ({ page }) => {
    await page.goto("/uz/surveys");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("So'rovnomalar");
    // other specs (admin import) may publish extra surveys into the shared demo store, so assert "at least the 2 samples"
    await expect.poll(() => page.locator("main a[href*='/uz/surveys/']").count()).toBeGreaterThanOrEqual(2);
    await page.goto("/en/surveys");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Surveys");
  });

  test("API: list / get never expose internals; invalid submits are rejected", async ({ request }) => {
    const list = await request.get("/api/surveys");
    expect(list.status()).toBe(200);
    const { surveys } = await list.json();
    expect(surveys.length).toBeGreaterThanOrEqual(2);
    const one = await (await request.get(`/api/surveys/${surveys[0].id}`)).json();
    expect(one.survey.questions.length).toBeGreaterThan(0);
    expect(JSON.stringify(one)).not.toMatch(/respondent|token_hash|created_at/);
    expect((await request.get("/api/surveys/does-not-exist")).status()).toBe(404);
    const bad = await request.post("/api/surveys/submit", { data: { surveyId: surveys[0].id, answers: {}, token: "x" } });
    expect(bad.status()).toBe(422);
    const cross = await request.post("/api/surveys/submit", { headers: { origin: "https://evil.example" }, data: {} });
    expect(cross.status()).toBe(403);
  });

  test("complete a survey, see thank-you, and the admin result count goes up", async ({ page, context }) => {
    const id = "svy-parents";
    await adminLogin(page);
    const before = await responseCount(page, id);
    expect(before).toBeGreaterThan(0);

    // a fresh anonymous visitor (no shared localStorage token)
    const visitor = await context.browser()!.newContext({ baseURL: new URL(page.url()).origin });
    const vp = await visitor.newPage();
    await vp.goto("/uz/surveys");
    await vp.locator("main a[href$='/uz/surveys/svy-parents']").click();
    await expect(vp).toHaveURL(/\/uz\/surveys\/svy-parents$/);
    await vp.waitForLoadState("networkidle");
    await completeParentsSurvey(vp);
    await expect(vp.getByTestId("survey-thanks")).toBeVisible({ timeout: 15_000 });
    await expect(vp.getByTestId("survey-thanks")).toContainText("Rahmat");

    // the same browser cannot answer twice
    await vp.goto("/uz/surveys/svy-parents");
    await vp.waitForLoadState("networkidle");
    await expect(vp.getByTestId("survey-thanks")).toBeVisible();
    await visitor.close();

    const after = await responseCount(page, id);
    expect(after).toBe(before + 1);
    // charts + the text answer are visible on the results page
    await expect(page.locator("svg.recharts-surface").first()).toBeVisible();
    await expect(page.getByText("E2E: more sport clubs, please")).toBeVisible();
  });

  test("admin: survey list has the survey and a builder with questions", async ({ page }) => {
    await adminLogin(page, "psixolog@demo.uz");
    await page.goto("/admin/surveys");
    await expect(page.getByText("Ota-onalar mamnunligi").first()).toBeVisible();
    // psychologist may read results but not create surveys
    await expect(page.getByRole("button", { name: /Yangi qo'shish/ })).toHaveCount(0);
    await page.goto("/admin/surveys/svy-parents/results");
    await expect(page.getByTestId("response-count")).toBeVisible({ timeout: 20_000 });
    expect((await page.request.get("/api/admin/surveys/svy-parents/results?from=bad")).status()).toBe(422);
  });

  test("results API requires a staff session", async ({ request }) => {
    expect((await request.get("/api/admin/surveys/svy-parents/results")).status()).toBe(401);
  });
});
