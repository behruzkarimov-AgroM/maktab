import { legacyError } from "@/lib/api";
import { NextResponse } from "next/server";
import { listQuizzes } from "./_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await listQuizzes(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return legacyError("server", 500);
  }
}
