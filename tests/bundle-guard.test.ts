import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guards that keep heavy libraries out of the first-load JS of the public landing pages and of the
 * portal pages (measured with .next/diagnostics/route-bundle-stats.json after `next build`):
 *  - recharts must only be reachable through next/dynamic (components/layout/LazyViews.tsx)
 *  - zod must not be imported by the public/landing/game client code (hand-written validation is used there)
 *  - jspdf / xlsx / tesseract.js / qrcode.react / canvas-confetti / lenis must be loaded with dynamic import()
 */
const ROOT = process.cwd();
const read = (f: string) => fs.readFileSync(f, "utf8");
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, "/");
const staticImport = (src: string, lib: string) => new RegExp(`^import\\s[^;]*from\\s+["']${lib.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/[^"']*)?["']`, "m").test(src);

const components = walk(path.join(ROOT, "components"));
const pages = walk(path.join(ROOT, "app")).filter((f) => !rel(f).startsWith("app/api/"));

describe("bundle guards", () => {
  it("recharts views are only reached through components/layout/LazyViews (next/dynamic)", () => {
    const chartFiles = components.filter((f) => staticImport(read(f), "recharts"));
    expect(chartFiles.length).toBeGreaterThan(0);
    const names = new Set(chartFiles.map((f) => path.basename(f).replace(/\.tsx?$/, "")));
    const offenders: string[] = [];
    for (const f of [...pages, ...components]) {
      if (rel(f) === "components/layout/LazyViews.tsx") continue;
      const src = read(f);
      for (const m of src.matchAll(/^import\s[^;]*from\s+["']([^"']+)["']/gm)) {
        const base = path.basename(m[1]);
        const target = m[1].startsWith("@/") ? path.join(ROOT, m[1].slice(2)) : path.resolve(path.dirname(f), m[1]);
        if (names.has(base) && chartFiles.some((c) => c.replace(/\\/g, "/").startsWith(target.replace(/\\/g, "/")))) offenders.push(`${rel(f)} -> ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no static zod in public / landing / games / layout client code", () => {
    const dirs = ["components/public", "components/home", "components/layout", "components/ui", "components/games", "components/surveys", "components/psych"];
    const offenders = components.filter((f) => dirs.some((d) => rel(f).startsWith(d + "/")) && staticImport(read(f), "zod")).map(rel);
    expect(offenders).toEqual([]);
  });

  it("heavy export / media libraries are never statically imported by client components", () => {
    const heavy = ["jspdf", "xlsx", "tesseract.js", "canvas-confetti", "lenis", "jszip", "docx", "mammoth", "gsap"];
    const offenders: string[] = [];
    for (const f of components) {
      const src = read(f);
      for (const lib of heavy) if (staticImport(src, lib)) offenders.push(`${rel(f)}: ${lib}`);
    }
    expect(offenders).toEqual([]);
  });

  it("qrcode.react is only imported by the (dynamically loaded) olympiad Ticket", () => {
    const users = components.filter((f) => staticImport(read(f), "qrcode.react")).map(rel);
    expect(users).toEqual(["components/olympiad/Ticket.tsx"]);
    const page = read(path.join(ROOT, "components/olympiad/OlympiadsPage.tsx"));
    expect(page).toMatch(/dynamic\(\(\) => import\("\.\/Ticket"\)/);
  });

  it("framer-motion `motion` is imported as the lazy `m` element (LazyMotion in MotionProvider)", () => {
    const offenders = components
      .filter((f) => /import\s*\{[^}]*\bmotion\b[^}]*\}\s*from\s*"framer-motion"/.test(read(f)) && !/m as motion/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });
});
