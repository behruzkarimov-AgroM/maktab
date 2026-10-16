import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { audit, loadDictionaries, scanHardcodedStrings, LOCALES, type Finding } from "./helpers/i18n-audit";

/**
 * Entries that are intentionally identical / mixed-script. Keep this list short and explain each one.
 * key format: "<dictionary> :: <key>"
 */
const ALLOW: Record<string, string> = {
  "messages/*.json :: meta.titleTemplate": "template only contains %s and the brand",
  "messages/*.json :: language.uz": "endonym: a language is always named in itself",
  "messages/*.json :: language.ru": "endonym",
  "lib/admin/ui-i18n :: scaleBad": "math expression",
  "lib/admin/ui-i18n :: imp_template_docx": "file format name",
  "lib/admin/ui-i18n :: imp_help_quiz": "documents the Cyrillic header keywords the importer accepts",
  "lib/admin/ui-i18n :: imp_help_survey": "documents the Cyrillic header keywords the importer accepts",
  "lib/admin/ui-i18n :: imp_translit": "example of Cyrillic -> Latin transliteration",
  "lib/school/i18n* :: d_half_up": "rounding example with Latin identifier",
};
const allowed = (f: Finding) => `${f.dict} :: ${f.key}` in ALLOW;

describe("i18n completeness", () => {
  const findings = audit().filter((f) => !allowed(f));

  it("every dictionary has the same keys in uz, ru and en", () => {
    expect(findings.filter((f) => f.kind === "missing")).toEqual([]);
  });

  it("no empty translations", () => {
    expect(findings.filter((f) => f.kind === "empty")).toEqual([]);
  });

  it("scripts are consistent: uz is Latin, en has no Cyrillic, ru is Cyrillic", () => {
    expect(findings.filter((f) => ["uz-has-cyrillic", "en-has-cyrillic", "ru-not-cyrillic"].includes(f.kind))).toEqual([]);
  });

  it("no string is a verbatim copy in all three languages (untranslated)", () => {
    expect(findings.filter((f) => f.kind === "same-in-all")).toEqual([]);
  });

  it("Uzbek uses one apostrophe style (ASCII ') everywhere", () => {
    expect(findings.filter((f) => f.kind === "uz-apostrophe")).toEqual([]);
  });

  it("Russian plural functions have distinct 1 / 2-4 / 5+ forms", () => {
    expect(findings.filter((f) => f.kind.startsWith("ru-plural"))).toEqual([]);
  });

  it("loads all dictionaries for all locales", () => {
    const dicts = loadDictionaries();
    expect(Object.keys(dicts).length).toBeGreaterThan(10);
    for (const [name, d] of Object.entries(dicts)) for (const l of LOCALES) expect(d[l].size, `${name} ${l}`).toBeGreaterThan(0);
  });
});

describe("dictionary sources", () => {
  it("no duplicate keys inside one dictionary file (the later one silently wins)", () => {
    const files = ["lib/admin/ui-i18n.ts", "lib/school/i18n.ts", "lib/school/i18n-account.ts", "lib/school/i18n-director.ts", "lib/school/i18n-family.ts", "lib/school/i18n-teacher.ts"];
    const dups: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(process.cwd(), f), "utf8");
      const seen = new Set<string>();
      for (const m of src.matchAll(/^ {2}(\w+): l\(/gm)) {
        if (seen.has(m[1])) dups.push(`${f}: ${m[1]}`);
        seen.add(m[1]);
      }
    }
    expect(dups).toEqual([]);
  });
});

describe("hard-coded UI strings", () => {
  /** brand names / technical tokens that are legitimately not translated */
  const OK = /^(Children's Academy|Children&apos;s Academy|Academy|Telegram|Supabase|Website|Promise|Русский|English|O'zbekcha|O&apos;zbekcha)$/;
  const OK_FILE_LINE: string[] = [
    // <option> labels are language endonyms
    "components/public/AdmissionDialog.tsx",
  ];
  it("JSX has no untranslated text nodes / aria-label / title / alt / placeholder literals", () => {
    const hits = scanHardcodedStrings().filter((h) => !OK.test(h.detail ?? "") && !OK_FILE_LINE.includes(h.dict));
    expect(hits).toEqual([]);
  });
});
