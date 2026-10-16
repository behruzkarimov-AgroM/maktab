import { legacyError } from "@/lib/api";
import { NextResponse } from "next/server";
import { startQuiz } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[\w-]{1,64}$/.test(id)) return legacyError("notFound", 404);
  try {
    const res = await startQuiz(id);
    if (!res || res.questions.length === 0) return legacyError("notFound", 404);
    return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return legacyError("server", 500);
  }
}
