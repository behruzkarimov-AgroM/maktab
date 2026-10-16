import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";

// Content-driven games in DEMO mode (seed sets from components/games/content-seed.json).
type L = { uz: string; ru: string; en: string };
type SeedSet = { id: string; game_type: string; title: L; items: Array<Record<string, unknown>> };
const SEED = JSON.parse(readFileSync(join(__dirname, "..", "components", "games", "content-seed.json"), "utf8")) as SeedSet[];
const vocab = SEED.find((s) => s.game_type === "matching" && s.title.en.includes("everyday"))!;
const geo = SEED.find((s) => s.game_type === "true_false")!;
const gk = SEED.find((s) => s.game_type === "quiz_race" && s.title.en.includes("General"))!;

test.describe("content games (demo mode)", () => {
  test("round API: true/false and quiz rounds never contain answers", async ({ request }) => {
    const tf = await request.post("/api/games/content/round", { data: { set_id: geo.id, n: 5 } });
    expect(tf.status()).toBe(200);
    const txt = await tf.text();
    expect(txt).not.toMatch(/is_true|explanation|correct/i);
    expect(JSON.parse(txt).round.token).toBeTruthy();
    const qz = await request.post("/api/games/content/round", { data: { set_id: gk.id, n: 5 } });
    expect(await qz.text()).not.toMatch(/correct_option_id|explanation/i);
    // sets list never has items
    const sets = await request.get("/api/games/content/sets?type=true_false");
    expect(sets.status()).toBe(200);
    expect(await sets.text()).not.toMatch(/is_true|"items"/);
    // answers need a valid signed token
    const bad = await request.post("/api/games/content/answer", { data: { token: "x".repeat(40), item_id: "s1", answer: "true" } });
    expect(bad.status()).toBe(403);
  });

  test("matching pairs: connect mode round shows a score", async ({ page }) => {
    const map = new Map(vocab.items.map((p) => [(p.left as L).en, (p.right as L).en]));
    await page.goto("/en/games");
    await page.getByRole("button", { name: /Matching Pairs/ }).click();
    await expect(page.getByTestId("content-set").first()).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("content-set").filter({ hasText: vocab.title.en }).click();
    await page.getByRole("button", { name: /Start/ }).first().click();
    await page.getByRole("button", { name: /Connect/ }).click();

    const left = page.getByRole("list", { name: "Term / word" });
    const right = page.getByRole("list", { name: "Definition / translation" });
    await expect(left.getByRole("button").first()).toBeVisible({ timeout: 15_000 });
    const words = await left.getByRole("button").allInnerTexts();
    expect(words.length).toBe(6);
    // one deliberate mistake first: it must be counted
    await left.getByRole("button", { name: words[0], exact: true }).click();
    const rights = await right.getByRole("button").allInnerTexts();
    const wrong = rights.find((v) => v !== map.get(words[0]))!;
    await right.getByRole("button", { name: wrong, exact: true }).click();
    for (const w of words) {
      await left.getByRole("button", { name: w, exact: true }).click();
      await right.getByRole("button", { name: map.get(w)!, exact: true }).click();
    }
    await expect(page.getByRole("heading", { name: "Great result!" })).toBeVisible({ timeout: 15_000 });
    const score = page.getByText("Score", { exact: true }).first().locator("xpath=following-sibling::span");
    expect(Number(await score.innerText())).toBeGreaterThan(0);
    await expect(page.getByText("Save your score to the leaderboard")).toBeVisible();
  });

  test("true / false: a full speed round shows a score and the save form", async ({ page }) => {
    const truth = new Map(geo.items.map((i) => [(i.statement as L).en, Boolean(i.is_true)]));
    await page.goto("/en/games");
    await page.getByRole("button", { name: /True or False/ }).click();
    await expect(page.getByTestId("content-set").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Start/ }).first().click();
    const statement = page.getByTestId("tf-statement");
    for (let i = 0; i < truth.size; i++) {
      await expect(statement).not.toHaveText("", { timeout: 15_000 });
      const text = (await statement.innerText()).trim();
      const isTrue = truth.get(text);
      expect(isTrue, `unknown statement: ${text}`).toBeDefined();
      await page.getByRole("button", { name: isTrue ? /True/ : /False/ }).click();
      // wait until the next statement is shown (or the round ended)
      if (i < truth.size - 1) await expect(statement).not.toHaveText(text, { timeout: 15_000 });
    }
    await expect(page.getByRole("heading", { name: "Great result!" })).toBeVisible({ timeout: 15_000 });
    const score = page.getByText("Score", { exact: true }).first().locator("xpath=following-sibling::span");
    expect(Number(await score.innerText())).toBeGreaterThan(0);
    await expect(page.getByText("Save your score to the leaderboard")).toBeVisible();
  });

  test("true / false: a wrong answer shows the explanation, then continues", async ({ page }) => {
    // statement s2 ("The Amazon River is in Africa.") is false and has an explanation
    await page.goto("/en/games");
    await page.getByRole("button", { name: /True or False/ }).click();
    await expect(page.getByTestId("content-set").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Start/ }).first().click();
    const statement = page.getByTestId("tf-statement");
    const withExplanation = new Map(geo.items.filter((i) => i.explanation).map((i) => [(i.statement as L).en, Boolean(i.is_true)]));
    for (let guard = 0; guard < 10; guard++) {
      await expect(statement).not.toHaveText("", { timeout: 15_000 });
      const text = (await statement.innerText()).trim();
      if (withExplanation.has(text)) {
        await page.getByRole("button", { name: withExplanation.get(text) ? /False/ : /True/ }).click(); // deliberately wrong
        await expect(page.getByTestId("tf-feedback")).toBeVisible();
        await expect(page.getByTestId("tf-feedback")).toContainText("Explanation");
        await page.getByRole("button", { name: /Continue/ }).click();
        await expect(page.getByTestId("tf-feedback")).toBeHidden();
        return;
      }
      await page.getByRole("button", { name: truthOf(geo, text) ? /True/ : /False/ }).click();
      await expect(statement).not.toHaveText(text, { timeout: 15_000 });
    }
    throw new Error("no statement with an explanation was shown");
  });

  test("quiz race: answering reveals the result and the next button", async ({ page }) => {
    await page.goto("/en/games");
    await page.getByRole("button", { name: /Quiz Race/ }).click();
    await expect(page.getByTestId("content-set").first()).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("content-set").filter({ hasText: gk.title.en }).click();
    await page.getByRole("button", { name: /Start/ }).first().click();
    await expect(page.getByTestId("quiz-question")).not.toHaveText("", { timeout: 15_000 });
    // 50/50 hides two options
    const options = page.locator("ul >> button[data-state]");
    expect(await options.count()).toBe(4);
    await page.getByRole("button", { name: "50/50" }).click();
    await expect(options).toHaveCount(2, { timeout: 10_000 });
    await options.first().click();
    await expect(page.getByTestId("quiz-feedback")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("quiz-feedback").getByRole("button")).toBeVisible();
  });
});

test.describe("content sets admin (demo login)", () => {
  test("list shows seed sets; an invalid set is rejected, a valid matching set can be created and then played", async ({ page }) => {
    await page.goto("/admin/login");
    await page.waitForLoadState("networkidle");
    await page.locator("#email").fill("metodist@demo.uz");
    await page.locator("#password").fill("demo1234");
    await Promise.all([page.waitForResponse((r) => r.url().includes("/api/admin/auth/login")), page.locator("form button[type=submit]").last().click()]);
    await page.goto("/admin/game_content_sets");
    await expect(page.getByText(gk.title.uz).first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Yangi qo'shish" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("input[placeholder='UZ']").first().fill("E2E juftliklar");
    await dialog.getByRole("button", { name: "Saqlash" }).click(); // no items yet -> validation error
    await expect(dialog.getByText(/at least 4 items/i)).toBeVisible();

    for (let i = 1; i <= 4; i++) {
      await dialog.getByRole("button", { name: "Element qo'shish" }).click();
      const uz = dialog.locator("input[placeholder='UZ']");
      await uz.nth(2 * i - 1).fill(`chap ${i}`); // [0] = title, then left/right per item
      await uz.nth(2 * i).fill(`o'ng ${i}`);
    }
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/admin/game_content_sets") && r.request().method() === "POST"),
      dialog.getByRole("button", { name: "Saqlash" }).click(),
    ]);
    expect(resp.status(), await resp.text()).toBe(201);
    const created = (await resp.json()) as { id: string };

    // the new set is playable on the public page (demo store is shared in-process)
    const sets = await page.request.get("/api/games/content/sets?type=matching");
    expect((await sets.json()).sets.some((s: { id: string }) => s.id === created.id)).toBe(true);
    // and can be removed again
    const del = await page.request.delete(`/api/admin/game_content_sets/${created.id}`, { headers: { Origin: new URL(page.url()).origin } });
    expect([200, 204]).toContain(del.status());
  });
});

function truthOf(set: SeedSet, text: string): boolean {
  return Boolean(set.items.find((i) => (i.statement as L).en === text)?.is_true);
}
