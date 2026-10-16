import {
  DEMO_ACHIEVEMENTS, DEMO_CAMPUS, DEMO_PROGRAMS, DEMO_SETTINGS, DEMO_STAFF, demoOlympiad,
  type AchievementData, type CampusSectionData, type OlympiadTeaserData, type ProgramData,
  type SiteSettingsData, type StaffData,
} from "@/lib/demo-data";
import { getPublicClient } from "@/lib/supabase/public";

async function query<T>(table: string, fallback: T[], build?: (q: any) => any): Promise<T[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const db = getPublicClient();
  if (!db) return fallback;
  try {
    let q = db.from(table).select("*");
    if (build) q = build(q);
    const { data, error } = await q;
    if (error || !data || data.length === 0) return fallback;
    return data as T[];
  } catch {
    return fallback;
  }
}

export async function getSettings(): Promise<SiteSettingsData> {
  const db = getPublicClient();
  if (!db) return DEMO_SETTINGS;
  try {
    const { data } = await db.from("site_settings").select("*").eq("id", 1).maybeSingle();
    if (!data) return DEMO_SETTINGS;
    const merged: Record<string, unknown> = { ...DEMO_SETTINGS };
    for (const [k, v] of Object.entries(data)) {
      if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) merged[k] = v;
    }
    return merged as SiteSettingsData;
  } catch {
    return DEMO_SETTINGS;
  }
}

export const getPrograms = () =>
  query<ProgramData>("programs", DEMO_PROGRAMS, (q) => q.eq("is_active", true).order("sort_order"));

export async function getCampus(): Promise<CampusSectionData[]> {
  const rows = await query<CampusSectionData>("campus_life", DEMO_CAMPUS, (q) => q.eq("is_active", true).order("sort_order"));
  // Fill missing sections from demo data so the page always has all four blocks.
  const have = new Set(rows.map((r) => r.section_key));
  return [...rows, ...DEMO_CAMPUS.filter((d) => !have.has(d.section_key))];
}

export const getStaff = () =>
  query<StaffData>("staff_members", DEMO_STAFF, (q) => q.eq("is_active", true).order("sort_order"));

export const getAchievements = () =>
  query<AchievementData>("student_achievements", DEMO_ACHIEVEMENTS, (q) => q.eq("is_active", true).order("sort_order"));

export async function getNextOlympiad(): Promise<OlympiadTeaserData> {
  const db = getPublicClient();
  if (!db) return demoOlympiad();
  try {
    const { data } = await db
      .from("olympiads")
      .select("id,title,description,event_date,location")
      .gte("event_date", new Date().toISOString())
      .order("event_date")
      .limit(1)
      .maybeSingle();
    return (data as OlympiadTeaserData) ?? demoOlympiad();
  } catch {
    return demoOlympiad();
  }
}
