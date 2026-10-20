import { NextResponse, after } from "next/server";
import { listOlympiads, registerForOlympiad } from "../_lib";
import { legacyError, readJson, rejectCrossOrigin } from "@/lib/api";
import { botRequest } from "@/lib/bot-auth";
import { normPhone, phoneCodesEnabled, verifyPhoneToken } from "@/lib/phone-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { notifyRegistration } from "@/lib/notify";
import { registrationSchema } from "@/components/olympiad/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cross = rejectCrossOrigin(req);
  if (cross) return cross;
  const limited = await enforceRateLimit(req, { key: "olympiad:register", max: 8, windowSec: 600 });
  if (limited) return limited;
  const raw = await readJson(req, 8 * 1024);
  if (!raw.ok) return raw.res;
  const parsed = registrationSchema.safeParse(raw.data);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0] ?? "form")] = String(i.message);
    return legacyError("invalid", 400, { fields });
  }
  // once the Telegram bot can deliver codes, the parent's phone must be verified (the bot's own requests are trusted)
  const phoneToken = (raw.data as { phoneToken?: unknown })?.phoneToken;
  if (phoneCodesEnabled() && !botRequest(req) && verifyPhoneToken(phoneToken, "verify") !== normPhone(parsed.data.parentPhone)) {
    return legacyError("phone_unverified", 400);
  }
  try {
    const res = await registerForOlympiad(parsed.data);
    if (!res.ok) {
      return legacyError(res.error, res.error === "server" ? 500 : res.error === "unavailable" ? 503 : 400);
    }
    const input = parsed.data;
    after(async () => {
      try {
        const { olympiads } = await listOlympiads();
        const o = olympiads.find((x) => x.id === res.ticket.olympiadId);
        await notifyRegistration({
          ticket: res.ticket.ticket,
          studentName: res.ticket.studentName,
          parentPhone: input.parentPhone,
          olympiadTitle: o?.title.en || o?.title.uz || "Olympiad",
          subject: o?.subjects.find((s) => s.key === res.ticket.subjectKey)?.name.en || res.ticket.subjectKey,
          eventDate: o ? o.eventDate.slice(0, 10) : "",
        });
      } catch {
        /* notifications are best-effort */
      }
    });
    return NextResponse.json({ ticket: res.ticket }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return legacyError("server", 500);
  }
}
