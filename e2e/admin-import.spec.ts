import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { createCanvas } from "@napi-rs/canvas";
import * as XLSX from "xlsx";
import { SURVEY, GAME } from "../lib/admin/import/template-data-extra";
import { UZ_QUIZ_LINES, docxFromLines, docxFromParts, table } from "../tests/fixtures/build-docx";
import { adminLogin } from "./admin-helpers";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

test.describe("admin: import quizzes / psych tests from Word", () => {
  test("upload docx -> preview -> create draft -> detail page -> listed", async ({ page }) => {
    const stamp = Date.now().toString().slice(-6);
    const lines = UZ_QUIZ_LINES.map((l) => (typeof l === "string" ? l.replace("E2E fizika testi", `E2E fizika ${stamp}`) : l));
    const buffer = await docxFromLines(lines);

    await adminLogin(page);
    await page.goto("/admin/academic_quizzes");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Word/PDF dan import" }).click();
    const dialog = page.getByTestId("import-dialog");
    await expect(dialog).toBeVisible();

    await page.getByTestId("import-file-input").setInputFiles({ name: "fizika.docx", mimeType: DOCX, buffer });
    await page.getByTestId("import-analyze").click();

    // preview: nothing saved yet, 3 questions, the bold option B is preselected as the correct one
    await expect(page.getByTestId("import-question")).toHaveCount(3);
    await expect(page.getByLabel("To'g'ri B").first()).toBeChecked();
    const before = await page.request.get(`/api/admin/academic_quizzes?q=${encodeURIComponent("E2E fizika " + stamp)}`);
    expect((await before.json()).total).toBe(0);

    // fix an answer in the preview, then create (draft by default)
    await page.getByLabel("To'g'ri C").nth(1).check();
    await page.getByTestId("import-create").click();
    await expect(page).toHaveURL(/\/admin\/academic_quizzes\/[^/]+$/, { timeout: 15_000 });

    // stored through the normal admin API: inactive draft, 3 questions, edited answer kept
    const list = await page.request.get(`/api/admin/academic_quizzes?q=${encodeURIComponent("E2E fizika " + stamp)}`);
    const body = await list.json();
    expect(body.total).toBe(1);
    const quiz = body.rows[0];
    expect(quiz.is_active).toBe(false);
    expect(quiz.subject_key).toBe("physics");
    expect(quiz.grade).toBe(7);
    expect(quiz.difficulty).toBe("easy");
    const qs = await (await page.request.get(`/api/admin/academic_questions?quiz_id=${quiz.id}&all=1`)).json();
    expect(qs.total).toBe(3);
    const byOrder = [...qs.rows].sort((a, b) => a.sort_order - b.sort_order);
    expect(byOrder.map((q) => q.correct_option_id)).toEqual(["B", "C", "B"]);
    // other languages stay empty (red dots in the editor show what to translate)
    expect(quiz.title.ru).toBe("");

    await page.goto("/admin/academic_quizzes");
    await expect(page.getByText(`E2E fizika ${stamp}`).first()).toBeVisible({ timeout: 10_000 });
  });

  test("publish immediately creates an active quiz; unreadable files show clear per-file errors", async ({ page }) => {
    const stamp = Date.now().toString().slice(-6);
    const good = await docxFromLines([`Nomi: E2E faol ${stamp}`, "Fan: Matematika", "Sinf: 5", "1. 2+2?", "A) 3", "B) 4", "Javob: B"]);
    await adminLogin(page);
    await page.goto("/admin/academic_quizzes");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Word/PDF dan import" }).click();
    await page.getByTestId("import-file-input").setInputFiles([
      { name: "ok.docx", mimeType: DOCX, buffer: good },
      { name: "fake.docx", mimeType: DOCX, buffer: Buffer.from("this is not a word file at all") },
      { name: "scan.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF") },
      { name: "notes.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ....") },
    ]);
    await page.getByTestId("import-analyze").click();
    const alerts = page.getByRole("alert").filter({ hasText: /\S/ });
    await expect(alerts.filter({ hasText: "Fayl mazmuni kengaytmasiga mos kelmaydi" })).toHaveCount(1);
    await expect(alerts.filter({ hasText: "Bu fayl turi qo'llab-quvvatlanmaydi" })).toHaveCount(1);
    // the valid file is still importable
    await page.getByRole("switch", { name: "Darhol e'lon qilish (faol)" }).click();
    await page.getByTestId("import-create").click();
    // created inactive first, then activated once all questions exist
    await expect
      .poll(async () => (await (await page.request.get(`/api/admin/academic_quizzes?q=${encodeURIComponent("E2E faol " + stamp)}`)).json()).rows[0]?.is_active, { timeout: 15_000 })
      .toBe(true);
  });

  test("psych test with a scale table is imported with scores and scales", async ({ page }) => {
    const stamp = Date.now().toString().slice(-6);
    const buffer = await docxFromParts([
      `Nomi: E2E so'rovnoma ${stamp}`,
      "Mavzu: Emotsional holat",
      "Auditoriya: O'smirlar",
      "Yo'riqnoma:",
      "Birinchi fikringiz bo'yicha javob bering.",
      "1. Uxlay olmaysizmi?",
      "A) Ha, doim (2)",
      "B) Ba'zan (1)",
      "C) Yo'q (0)",
      "2. Qo'rqasizmi?",
      "A) Ha, doim [2]",
      "B) Ba'zan [1]",
      "C) Yo'q [0]",
      table([
        ["Ball", "Natija", "Tahlil", "Tavsiya"],
        ["0-2", "Past", "Past daraja", "Davom eting"],
        ["3-4", "Yuqori", "Yuqori daraja", "Psixologga murojaat qiling"],
      ]),
    ]);
    await adminLogin(page, "psixolog@demo.uz");
    await page.goto("/admin/psych_tests");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Word/PDF dan import" }).click();
    await page.getByTestId("import-file-input").setInputFiles({ name: "so'rovnoma.docx", mimeType: DOCX, buffer });
    await page.getByTestId("import-analyze").click();
    await expect(page.getByTestId("import-question")).toHaveCount(2);
    await page.getByTestId("import-create").click();
    await expect(page).toHaveURL(/\/admin\/psych_tests\/[^/]+$/, { timeout: 15_000 });
    const found = await (await page.request.get(`/api/admin/psych_tests?q=${encodeURIComponent("E2E so'rovnoma " + stamp)}`)).json();
    expect(found.total).toBe(1);
    const t = found.rows[0];
    expect(t.topic).toBe("emotional");
    expect(t.target_audience).toBe("teens");
    const scales = await (await page.request.get(`/api/admin/psych_result_scales?psych_test_id=${t.id}&all=1`)).json();
    expect(scales.total).toBe(2);
  });

  test("API: roles, same-origin, validation and stable error codes", async ({ page, request }) => {
    // anonymous
    const anon = await request.post("/api/admin/import?kind=quiz", { multipart: { file: { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("1. x") } } });
    expect(anon.status()).toBe(401);

    await adminLogin(page, "metodist@demo.uz");
    const send = (name: string, buffer: Buffer, kind = "quiz", headers: Record<string, string> = {}) =>
      page.request.post(`/api/admin/import?kind=${kind}`, { multipart: { file: { name, mimeType: "application/octet-stream", buffer }, lang: "auto" }, headers });

    // methodist may import quizzes but not psych tests
    expect((await send("a.txt", Buffer.from("1. Savol?\nA) a\nB) b\nJavob: A"))).status()).toBe(200);
    expect((await send("a.txt", Buffer.from("1. Savol?\nA) a (1)\nB) b (0)"), "psych")).status()).toBe(403);
    // cross-origin is refused
    expect((await send("a.txt", Buffer.from("1. x"), "quiz", { origin: "https://evil.example" })).status()).toBe(403);
    // stable codes
    const bad = await send("a.docx", Buffer.from("%PDF-1.4 not a docx"));
    expect(bad.status()).toBe(400);
    expect(await bad.json()).toMatchObject({ ok: false, error: "bad_magic" });
    const big = await send("big.txt", Buffer.alloc(10 * 1024 * 1024 + 10, 65));
    expect(big.status()).toBe(413);
    expect((await big.json()).error).toBe("file_too_large");
    const none = await send("n.txt", Buffer.from("faqat matn"));
    expect(none.status()).toBe(422);
    expect((await none.json()).error).toBe("no_questions");
    // JSON bodies are not accepted
    const json = await page.request.post("/api/admin/import?kind=quiz", { data: { a: 1 } });
    expect(json.status()).toBe(415);
    // templates download for permitted roles
    const tpl = await page.request.get("/api/admin/import/template?kind=quiz&lang=ru&format=docx");
    expect(tpl.status()).toBe(200);
    expect(tpl.headers()["content-disposition"]).toContain("quiz-template-ru.docx");
    expect((await tpl.body()).subarray(0, 2).toString()).toBe("PK");
    expect((await page.request.get("/api/admin/import/template?kind=psych&format=txt")).status()).toBe(403);
  });
  test("one entry page /admin/import lists only the types a role may import", async ({ page }) => {
    await adminLogin(page, "psixolog@demo.uz");
    await page.goto("/admin/import");
    await expect(page.getByTestId("import-kind-psych")).toBeVisible();
    await expect(page.getByTestId("import-kind-quiz")).toHaveCount(0);
    await expect(page.getByTestId("import-kind-game")).toHaveCount(0);
    await page.context().clearCookies();
    await adminLogin(page);
    await page.goto("/admin/import");
    for (const k of ["quiz", "psych", "survey", "game"]) await expect(page.getByTestId(`import-kind-${k}`)).toBeVisible();
  });

  test("quiz: import -> publish -> visible on the public /quizzes page (demo mode), answer key stays private", async ({ page }) => {
    const stamp = Date.now().toString().slice(-6);
    const buffer = await docxFromLines([`Nomi: Jamoat testi ${stamp}`, "Fan: Fizika", "Sinf: 7", "1. Tezlik birligi?", "A) kg", "B) m/s", "Javob: B", "Izoh: Masofa / vaqt."]);
    await adminLogin(page);
    await page.goto("/admin/import");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("import-kind-quiz").click();
    await page.getByTestId("import-file-input").setInputFiles({ name: "q.docx", mimeType: DOCX, buffer });
    await page.getByTestId("import-analyze").click();
    await expect(page.getByTestId("import-question")).toHaveCount(1);
    await page.getByRole("switch", { name: "Darhol e'lon qilish (faol)" }).click();
    await page.getByTestId("import-create").click();
    await expect(page).toHaveURL(/\/admin\/academic_quizzes\/[^/]+$/, { timeout: 15_000 });
    const id = page.url().split("/").pop()!;
    await expect.poll(async () => JSON.stringify(await (await page.request.get("/api/quiz")).json()), { timeout: 15_000 }).toContain(`Jamoat testi ${stamp}`);
    await page.goto("/uz/quizzes");
    await expect(page.getByText(`Jamoat testi ${stamp}`).first()).toBeVisible({ timeout: 15_000 });
    const start = await page.request.get(`/api/quiz/${id}`);
    expect(start.status()).toBe(200);
    const text = JSON.stringify(await start.json());
    expect(text).toContain("m/s");
    expect(text).not.toMatch(/correct|Masofa/i);
  });

  test("psych: import -> publish -> visible on the public /psychology page", async ({ page }) => {
    const stamp = Date.now().toString().slice(-6);
    const buffer = await docxFromLines([
      `Nomi: Jamoat so'rovnomasi ${stamp}`, "Mavzu: Qiziqishlar", "Auditoriya: Bolalar", "Yo'riqnoma:", "Javob bering.",
      "1. Sevasizmi?", "A) Ha (1)", "B) Yo'q (0)", "Natijalar:", "0-1 ball: Hammasi yaxshi — Yaxshi natija. | Tavsiya: Davom eting.",
    ]);
    await adminLogin(page);
    await page.goto("/admin/psych_tests");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Word/PDF dan import" }).click();
    await page.getByTestId("import-file-input").setInputFiles({ name: "p.docx", mimeType: DOCX, buffer });
    await page.getByTestId("import-analyze").click();
    await expect(page.getByTestId("import-question")).toHaveCount(1);
    await page.getByRole("switch", { name: "Darhol e'lon qilish (faol)" }).click();
    await page.getByTestId("import-create").click();
    await expect(page).toHaveURL(/\/admin\/psych_tests\/[^/]+$/, { timeout: 15_000 });
    await expect.poll(async () => (await page.request.get("/uz/psychology")).text().then((t) => t.includes(`Jamoat so&#x27;rovnomasi ${stamp}`) || t.includes(`Jamoat so'rovnomasi ${stamp}`)), { timeout: 15_000 }).toBe(true);
    await page.goto("/uz/psychology");
    await expect(page.getByText(`Jamoat so'rovnomasi ${stamp}`).first()).toBeVisible({ timeout: 15_000 });
  });

  test("survey: import docx from /admin/import -> publish -> visible on the public /surveys page", async ({ page }) => {
    const stamp = Date.now().toString().slice(-6);
    const lines = SURVEY.uz.filter((l) => !/^(Boshlanish|Tugash):/.test(l)).map((l) => l.replace("Ota-onalar mamnunligi", `Ota-onalar ${stamp}`));
    const buffer = await docxFromLines(lines);
    await adminLogin(page);
    await page.goto("/admin/import");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("import-kind-survey").click();
    await page.getByTestId("import-file-input").setInputFiles({ name: "survey.docx", mimeType: DOCX, buffer });
    await page.getByTestId("import-analyze").click();
    await expect(page.getByTestId("import-question")).toHaveCount(5);
    await page.getByRole("switch", { name: "Darhol e'lon qilish (faol)" }).click();
    await page.getByTestId("import-create").click();
    await expect(page).toHaveURL(/\/admin\/surveys\/[^/]+$/, { timeout: 15_000 });
    const list = await (await page.request.get(`/api/admin/surveys?q=${encodeURIComponent("Ota-onalar " + stamp)}`)).json();
    expect(list.total).toBe(1);
    expect(list.rows[0].audience).toBe("parents");
    const qs = await (await page.request.get(`/api/admin/survey_questions?survey_id=${list.rows[0].id}&all=1`)).json();
    expect([...qs.rows].sort((a, b) => a.sort_order - b.sort_order).map((q) => q.type)).toEqual(["scale", "multiple", "single", "yesno", "text"]);
    await expect.poll(async () => (await (await page.request.get(`/api/admin/surveys?q=${encodeURIComponent("Ota-onalar " + stamp)}`)).json()).rows[0]?.is_active, { timeout: 15_000 }).toBe(true);
    await page.goto("/uz/surveys");
    await expect(page.getByText(`Ota-onalar ${stamp}`).first()).toBeVisible({ timeout: 15_000 });
  });

  test("game content: matching pairs from a docx -> publish -> listed in the public games API", async ({ page }) => {
    const stamp = Date.now().toString().slice(-6);
    const lines = GAME.matching.uz.map((l) => l.replace("Ingliz tili: hayvonlar", `Hayvonlar ${stamp}`));
    const buffer = await docxFromLines(lines);
    await adminLogin(page);
    await page.goto("/admin/game_content_sets");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Word/PDF dan import" }).click();
    await page.getByTestId("import-file-input").setInputFiles({ name: "pairs.docx", mimeType: DOCX, buffer });
    await page.getByTestId("import-analyze").click();
    await expect(page.getByTestId("import-question")).toHaveCount(6);
    await page.getByRole("switch", { name: "Darhol e'lon qilish (faol)" }).click();
    await page.getByTestId("import-create").click();
    await expect.poll(async () => JSON.stringify(await (await page.request.get("/api/games/content/sets?type=matching")).json()), { timeout: 15_000 }).toContain(`Hayvonlar ${stamp}`);
    const admin = await (await page.request.get(`/api/admin/game_content_sets?q=${encodeURIComponent("Hayvonlar " + stamp)}`)).json();
    expect(admin.rows[0].game_type).toBe("matching");
    expect(admin.rows[0].items).toHaveLength(6);
    expect(admin.rows[0].subject_key).toBe("english");
  });  test("any file: .xlsx, .pptx and a picture of text (OCR) become quiz drafts", async ({ page }) => {
    test.setTimeout(180_000);
    const stamp = Date.now().toString().slice(-6);
    // 1) spreadsheet
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["title", "question", "A", "B", "correct"], [`Excel testi ${stamp}`, "2+2?", "3", "4", "B"], ["", "3+3?", "6", "7", "A"]]), "Sheet1");
    const xlsx = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    // 2) presentation
    const z = new JSZip();
    z.file("ppt/presentation.xml", "<p:presentation/>");
    const para = (t: string) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`;
    z.file("ppt/slides/slide1.xml", `<p:sld><p:cSld><p:spTree>${[`Nomi: Slayd testi ${stamp}`, "1. Tezlik birligi?", "A) kg", "B) m/s", "Javob: B"].map(para).join("")}</p:spTree></p:cSld></p:sld>`);
    const pptx = Buffer.from(await z.generateAsync({ type: "uint8array" }));
    // 3) picture of text
    const c = createCanvas(1100, 520);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 1100, 520);
    ctx.fillStyle = "#000";
    ctx.font = "34px sans-serif";
    [`Title: Picture quiz ${stamp}`, "1. What is two plus two?", "A) three", "B) four", "C) five", "Answer: B"].forEach((l, i) => ctx.fillText(l, 40, 70 + i * 56));
    const png = Buffer.from(c.toBuffer("image/png"));

    await adminLogin(page);
    await page.goto("/admin/import");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("import-kind-quiz").click();
    await page.getByTestId("import-file-input").setInputFiles([
      { name: "t.xlsx", mimeType: "application/octet-stream", buffer: xlsx },
      { name: "s.pptx", mimeType: "application/octet-stream", buffer: pptx },
      { name: "pic.png", mimeType: "image/png", buffer: png },
    ]);
    await page.getByTestId("import-analyze").click();
    // three previews: 2 + 1 + 1 questions, with the detected type and the parser shown
    await expect(page.getByText("XLSX", { exact: true })).toBeVisible({ timeout: 150_000 });
    await expect(page.getByText("PPTX", { exact: true })).toBeVisible();
    await expect(page.getByText("IMAGE", { exact: true })).toBeVisible({ timeout: 150_000 });
    await expect(page.getByText(/^OCR \d+%$/)).toBeVisible();
    await page.getByRole("button", { name: /^Yaratish \(3\)$/ }).click();
    for (const name of [`Excel testi ${stamp}`, `Slayd testi ${stamp}`]) {
      await expect.poll(async () => (await (await page.request.get(`/api/admin/academic_quizzes?q=${encodeURIComponent(name)}`)).json()).total, { timeout: 20_000 }).toBe(1);
    }
    // the drafts are saved one after another: wait for the third (OCR) one too instead of reading the list once
    await expect
      .poll(async () => JSON.stringify(await (await page.request.get("/api/admin/academic_quizzes?sort=created_at&dir=desc&pageSize=10")).json()), { timeout: 20_000 })
      .toContain("Picture quiz");
  });});
