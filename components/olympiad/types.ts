import { z } from "zod";
import type { LocalizedText } from "@/lib/types";

export interface OlympiadSubject {
  key: string;
  name: LocalizedText;
}

export interface Olympiad {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  rules: LocalizedText | null;
  subjects: OlympiadSubject[];
  eligibleGrades: number[];
  eventDate: string; // ISO
  registrationDeadline: string; // ISO
  location: LocalizedText;
  isRegistrationOpen: boolean;
  isResultsPublished: boolean;
}

export interface OlympiadListResponse {
  demo: boolean;
  demoTickets?: string[];
  olympiads: Olympiad[];
}

/** Issued by the server only. */
export interface IssuedTicket {
  ticket: string;
  qrPayload: string;
  studentName: string;
  school: string;
  grade: number;
  subjectKey: string;
  olympiadId: string;
}

export interface PublicResult {
  name: string;
  ticket: string;
  subjectKey: string | null;
  subjectName: LocalizedText | null;
  status: "pending" | "confirmed" | "attended" | "disqualified";
  score: number;
  maxScore: number;
  rank: number | null;
}

export interface LeaderRow {
  name: string;
  subjectKey: string;
  score: number;
  maxScore: number;
  rank: number;
}

export interface LeaderGroup {
  subjectKey: string;
  rows: { rank: number; name: string; score: number; maxScore: number }[];
}

/** "Karimov Bobur" -> "Karimov B." (no full names in public leaderboards). */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${Array.from(parts[1])[0].toUpperCase()}.`;
}

/** OLY-YYYY-NNNNNN (legacy / demo, 6 digits) or OLY-YYYY-XXXXXXXXXX (10 hex chars, unguessable). */
export const TICKET_RE = /^OLY-\d{4}-(?:\d{6}|[0-9A-F]{10})$/;

/** Error keys (not text) so each side can translate them. */
export const registrationSchema = z.object({
  olympiadId: z.string().min(1, "olympiad").max(64, "olympiad"),
  studentFullName: z
    .string()
    .trim()
    .min(5, "name")
    .max(120, "name")
    .regex(/^[\p{L}\p{M}'ʻʼ‘’`.\- ]+$/u, "name")
    .refine((s) => s.split(/\s+/).length >= 2, "name"),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "birth")
    .refine((s) => {
      const d = new Date(s + "T00:00:00Z");
      if (Number.isNaN(d.getTime())) return false;
      const age = (Date.now() - d.getTime()) / (365.25 * 86400000);
      return age >= 5 && age <= 25;
    }, "birth"),
  currentSchool: z.string().trim().min(2, "school").max(120, "school"),
  grade: z.number().int("grade").min(1, "grade").max(11, "grade"),
  subjectKey: z.string().min(1, "subject").max(64, "subject"),
  parentPhone: z.string().regex(/^\+998\d{9}$/, "phone"),
  extraPhone: z.union([z.literal(""), z.string().regex(/^\+998\d{9}$/, "phone")]).optional(),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;

export { maskPhone, phoneValue } from "./phone";
