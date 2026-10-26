// Validates content/quizzes/grade-N.json and generates:
//   supabase/content/quizzes-grades-2-6.sql  (idempotent: fixed UUIDs, upsert, safe to run many times)
//   content/quizzes/bundle.json              (flat list for demo mode / admin import)
// Usage: node scripts/content/build-quizzes.mjs [--check]
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const onlyArg = process.argv.find((a) => a.startsWith("--grade="));
const GRADES = onlyArg ? [Number(onlyArg.split("=")[1])] : [2, 3, 4, 5, 6];
const LETTERS = ["A", "B", "C", "D"];
const NS = "6f1c1d52-2b0a-4a43-9c61-7a1f4e0b9c10";

const uuid5 = (name) => {
  const ns = Buffer.from(NS.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(ns).update(name).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
};

const SUBJECT = {
  uz: "Aralash fanlar (matematika, mantiq, ingliz tili)",
  ru: "Смешанные предметы (математика, логика, английский)",
  en: "Mixed subjects (maths, logic, English)",
};
const errors = [];
const warns = [];
const err = (m) => errors.push(m);
const norm = (s) => String(s ?? "").toLowerCase().replace(/[\s ]+/g, " ").replace(/[’‘ʻʼ`´]/g, "'").trim();
const loc = (o) => (o && typeof o === "object" ? o : {});

const bundle = [];
for (const g of GRADES) {
  const file = join(root, "content", "quizzes", `grade-${g}.json`);
  if (!existsSync(file)) { err(`grade-${g}.json yo'q`); continue; }
  let data;
  try { data = JSON.parse(readFileSync(file, "utf8")); } catch (e) { err(`grade-${g}.json JSON xato: ${e.message}`); continue; }
  if (data.grade !== g) err(`grade-${g}.json: grade=${data.grade}`);
  const variants = data.variants ?? [];
  if (variants.length !== 4) err(`grade-${g}: 4 variant kerak, ${variants.length} ta bor`);
  const seenStem = new Map();
  for (const v of variants) {
    const tag = `${g}-sinf ${v.variant}-variant`;
    if (![1, 2, 3, 4].includes(v.variant)) err(`${tag}: variant raqami noto'g'ri`);
    if (!loc(v.title).uz) err(`${tag}: title.uz yo'q`);
    if (!(v.durationMinutes >= 20 && v.durationMinutes <= 60)) err(`${tag}: durationMinutes 20..60 bo'lsin`);
    if (!["easy", "medium", "hard"].includes(v.difficulty)) err(`${tag}: difficulty noto'g'ri`);
    const qs = v.questions ?? [];
    if (qs.length < 25 || qs.length > 35) err(`${tag}: savollar soni ${qs.length} (25..35 kerak)`);
    const count = { A: 0, B: 0, C: 0, D: 0 };
    const sections = {};
    qs.forEach((q, i) => {
      const qt = `${tag} #${i + 1}`;
      if (!["math", "logic", "english"].includes(q.section)) err(`${qt}: section noto'g'ri`);
      sections[q.section] = (sections[q.section] ?? 0) + 1;
      const stem = loc(q.stem).uz;
      if (!stem || String(stem).trim().length < 3) err(`${qt}: savol matni bo'sh`);
      const opts = q.options ?? [];
      if (opts.length !== 4) err(`${qt}: aynan 4 variant kerak`);
      const ids = opts.map((o) => o.id);
      if (ids.join("") !== LETTERS.join("")) err(`${qt}: variant id lari A,B,C,D tartibida bo'lsin`);
      const texts = opts.map((o) => norm(loc(o.text).uz));
      if (texts.some((t) => !t)) err(`${qt}: bo'sh variant`);
      if (new Set(texts).size !== texts.length) err(`${qt}: takrorlangan variantlar`);
      if (!ids.includes(q.correct)) err(`${qt}: correct (${q.correct}) variantlar ichida yo'q`);
      else count[q.correct]++;
      if (!loc(q.explanation).uz || String(q.explanation.uz).trim().length < 3) err(`${qt}: izoh yo'q`);
      if (q.figure || q.questionImage) err(`${qt}: rasmli savol kiritilmaydi`);
      const key = norm(stem) + "|" + texts.join("|");
      if (seenStem.has(norm(stem))) warns.push(`${qt}: matn ${seenStem.get(norm(stem))} bilan bir xil`);
      else seenStem.set(norm(stem), tag + " #" + (i + 1));
      void key;
    });
    const n = qs.length || 1;
    for (const L of LETTERS) {
      const share = count[L] / n;
      if (share < 0.15 || share > 0.35) err(`${tag}: to'g'ri javob '${L}' ulushi ${(share * 100).toFixed(0)}% (15..35% kerak)`);
    }
    if (!sections.math || !sections.english) warns.push(`${tag}: bo'limlar ${JSON.stringify(sections)}`);
    const quizId = uuid5(`ca-quiz-g${g}-v${v.variant}`);
    bundle.push({
      id: quizId, grade: g, variant: v.variant,
      title: v.title, description: v.description ?? null, subject_key: "mixed", subject_name: SUBJECT,
      difficulty: v.difficulty, duration_minutes: v.durationMinutes, passing_score_percent: v.passPercent ?? 60, is_active: true,
      questions: qs.map((q, i) => ({
        id: uuid5(`${quizId}:q${i + 1}`), sort_order: i + 1,
        question_text: { uz: q.stem.uz, ru: q.stem.ru ?? "", en: q.stem.en ?? "" },
        options: q.options.map((o) => ({ id: o.id, text: { uz: o.text.uz, ru: o.text.ru ?? "", en: o.text.en ?? "" } })),
        correct_option_id: q.correct,
        explanation: { uz: q.explanation.uz, ru: q.explanation.ru ?? "", en: q.explanation.en ?? "" },
        points: q.points ?? 1, section: q.section, source: q.source ?? "new",
      })),
    });
  }
}

console.log(`Quizlar: ${bundle.length}, savollar: ${bundle.reduce((s, q) => s + q.questions.length, 0)}`);
warns.slice(0, 40).forEach((w) => console.log("  ogohlantirish:", w));
if (warns.length > 40) console.log(`  ... yana ${warns.length - 40} ogohlantirish`);
if (errors.length) {
  console.error(`\n${errors.length} ta XATO:`);
  errors.slice(0, 80).forEach((e) => console.error("  -", e));
  process.exit(1);
}
if (process.argv.includes("--check") || onlyArg) { console.log("OK (faqat tekshiruv, fayl yozilmadi)"); process.exit(0); }

// ---- outputs ----
const j = (o) => `$j$${JSON.stringify(o)}$j$::jsonb`;
const out = [
  "-- Generated by scripts/content/build-quizzes.mjs from content/quizzes/*.json. Do not edit by hand.",
  "-- Idempotent: fixed UUIDs + upsert. Re-running updates the same quizzes and questions (no duplicates).",
  "begin;",
];
for (const q of bundle) {
  out.push(
    `insert into public.academic_quizzes (id, title, description, subject_key, subject_name, grade, difficulty, duration_minutes, passing_score_percent, is_active)`,
    `values ('${q.id}', ${j(q.title)}, ${q.description ? j(q.description) : "null"}, '${q.subject_key}', ${j(q.subject_name)}, ${q.grade}, '${q.difficulty}', ${q.duration_minutes}, ${q.passing_score_percent}, true)`,
    `on conflict (id) do update set title = excluded.title, description = excluded.description, subject_name = excluded.subject_name, grade = excluded.grade,`,
    `  difficulty = excluded.difficulty, duration_minutes = excluded.duration_minutes, passing_score_percent = excluded.passing_score_percent, is_active = true;`,
  );
  for (const x of q.questions) {
    out.push(
      `insert into public.academic_questions (id, quiz_id, question_text, options, correct_option_id, explanation, points, sort_order)`,
      `values ('${x.id}', '${q.id}', ${j(x.question_text)}, ${j(x.options)}, '${x.correct_option_id}', ${j(x.explanation)}, ${x.points}, ${x.sort_order})`,
      `on conflict (id) do update set question_text = excluded.question_text, options = excluded.options, correct_option_id = excluded.correct_option_id,`,
      `  explanation = excluded.explanation, points = excluded.points, sort_order = excluded.sort_order;`,
    );
  }
  out.push(`delete from public.academic_questions where quiz_id = '${q.id}' and sort_order > ${q.questions.length};`, "");
}
out.push("commit;");
const sqlDir = join(root, "supabase", "content");
mkdirSync(sqlDir, { recursive: true });
writeFileSync(join(sqlDir, "quizzes-grades-2-6.sql"), out.join("\n") + "\n", "utf8");
writeFileSync(join(root, "content", "quizzes", "bundle.json"), JSON.stringify(bundle, null, 1) + "\n", "utf8");
console.log("Yozildi: supabase/content/quizzes-grades-2-6.sql, content/quizzes/bundle.json");
