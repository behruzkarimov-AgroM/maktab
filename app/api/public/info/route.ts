import { apiOk, apiError } from "@/lib/api";
import { getPrograms, getSettings } from "@/components/public/data";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/info -> { school, programs } : the public facts the website shows (contact, hours, about, programs), trilingual.
 * Used by the Telegram bot; nothing here is private.
 */
export async function GET(req: Request) {
  const limited = await enforceRateLimit(req, { key: "public:info", max: 120, windowSec: 60, store: "memory" });
  if (limited) return limited;
  try {
    const [s, programs] = await Promise.all([getSettings(), getPrograms()]);
    return apiOk({
      school: {
        name: s.school_name, address: s.address, landmark: s.landmark, phones: s.phones, email: s.email, working_hours: s.working_hours,
        mission: s.about_mission, map: s.map_lat !== null && s.map_lng !== null ? { lat: s.map_lat, lng: s.map_lng } : null,
        social: s.social_links ?? {}, stats: s.stats,
      },
      programs: programs.map((p) => ({ id: p.id, grades: p.grade_range, title: p.title, summary: p.short_description, details: p.full_content, subjects: p.subjects.map((x) => x.name) })),
    });
  } catch {
    return apiError("server_error", 500);
  }
}
