import { NextResponse, type NextRequest } from "next/server";
import { guard, isNextResponse } from "@/lib/admin/auth";
import { apiError } from "@/lib/api";
import { templateDocx, templateText } from "@/lib/admin/import/templates";
import { IMPORT_KINDS, KIND_RESOURCE, type GameType, type ImportKind } from "@/lib/admin/import/types";
import type { Locale } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LANGS: Locale[] = ["uz", "ru", "en"];

/** GET /api/admin/import/template?kind=quiz|psych&lang=uz|ru|en&format=docx|txt */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind");
  if (!kind || !(IMPORT_KINDS as string[]).includes(kind)) return apiError("kind_invalid", 400);
  const k = kind as ImportKind;
  const gt = sp.get("type");
  const gameType: GameType = gt === "true_false" || gt === "quiz_race" ? gt : "matching";
  const g = await guard(KIND_RESOURCE[k], "write");
  if (isNextResponse(g)) return g;
  const lang = (LANGS as string[]).includes(sp.get("lang") ?? "") ? (sp.get("lang") as Locale) : "uz";
  const format = sp.get("format") === "txt" ? "txt" : "docx";
  const name = `${k === "psych" ? "psych-test" : k === "game" ? `game-${gameType}` : k}-template-${lang}.${format}`;
  const headers = { "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (format === "txt") {
    return new NextResponse(templateText(k, lang, gameType), { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
  }
  try {
    const bytes = await templateDocx(k, lang, gameType);
    return new NextResponse(Buffer.from(bytes), {
      headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    });
  } catch {
    return apiError("server_error", 500);
  }
}
