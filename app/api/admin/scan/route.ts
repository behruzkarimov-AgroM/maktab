import { NextResponse, type NextRequest } from "next/server";
import { logAudit } from "@/lib/admin/audit";
import { checkMutation, failResponse, guard, isNextResponse, jsonError } from "@/lib/admin/auth";
import { RESOURCE_MAP } from "@/lib/admin/resources";
import { extractTicket } from "@/lib/admin/ticket";
import { getRow, listRows, markAttended } from "@/lib/admin/store";
import { tr } from "@/lib/types";

/** POST { ticket } - marks an olympiad registration as attended (staff check-in). */
export async function POST(req: NextRequest) {
  const g = await guard("olympiad_registrations", "write");
  if (isNextResponse(g)) return g;
  const bad = checkMutation(req, { maxBytes: 8192 });
  if (bad) return bad;
  const body = (await req.json().catch(() => null)) as { ticket?: string; olympiad_id?: string } | null;
  const olympiadId = String(body?.olympiad_id ?? "").trim();
  if (!olympiadId) return jsonError("olympiad_id required", 400, { code: "olympiad_required" });
  // accept raw ticket, URL or JSON payload containing it
  const ticket = extractTicket(body?.ticket);
  if (!ticket) return jsonError("Invalid ticket", 400, { code: "unknown" });

  const reg = RESOURCE_MAP.olympiad_registrations;
  try {
    const found = await listRows(reg, { filters: { ticket_number: ticket, olympiad_id: olympiadId }, pageSize: 1 });
    const row = found.rows[0];
    if (!row) return jsonError("Ticket not found for this olympiad", 404, { code: "unknown", ticket });
    const oly = await getRow(RESOURCE_MAP.olympiads, String(row.olympiad_id)).catch(() => null);
    const participant = {
      ticket,
      name: String(row.student_full_name),
      subject: String(row.subject_key),
      grade: row.grade,
      olympiad: oly ? tr(oly.title as never, "uz") : null,
    };
    if (row.status === "attended") return jsonError("Already checked in", 409, { code: "duplicate", participant });
    if (row.status === "disqualified") return jsonError("Disqualified", 409, { code: "disqualified", participant });
    const prev = row.status;
    const done = await markAttended(String(row.id));
    if (!done) return jsonError("Already checked in", 409, { code: "duplicate", participant }); // lost the race
    await logAudit(g.session, "scan", reg.key, row.id, { status: { from: prev, to: "attended" }, ticket });
    return NextResponse.json({ ok: true, participant });
  } catch (e) {
    return failResponse(e, "admin:scan");
  }
}
