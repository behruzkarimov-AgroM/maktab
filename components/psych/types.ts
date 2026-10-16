import type { LocalizedText } from "@/lib/types";

export type Audience = "kids" | "teens" | "older" | "parents";
export type Topic = "interests" | "temperament" | "career" | "readiness" | "emotional";

export const AUDIENCES: Audience[] = ["kids", "teens", "older", "parents"];
export const TOPICS: Topic[] = ["interests", "temperament", "career", "readiness", "emotional"];

/** Option as seen by the browser: NO score. */
export interface PublicOption {
  id: string;
  text: LocalizedText;
}
export interface PublicQuestion {
  id: string;
  text: LocalizedText;
  options: PublicOption[];
}
export interface PublicTest {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  instruction: LocalizedText;
  audience: Audience;
  topic?: Topic;
  questions: PublicQuestion[];
}

/** Server-only shapes (demo data keeps scores). */
export interface ScoredOption extends PublicOption {
  score: number;
}
export interface ScoredQuestion {
  id: string;
  text: LocalizedText;
  options: ScoredOption[];
}
export interface ResultScale {
  min: number;
  max: number;
  title: LocalizedText;
  analysis: LocalizedText;
  recommendations: LocalizedText;
  badge: string;
}
export interface DemoTest extends Omit<PublicTest, "questions"> {
  questions: ScoredQuestion[];
  scales: ResultScale[];
}

export interface PsychResult {
  total_score: number;
  title: LocalizedText;
  analysis: LocalizedText;
  recommendations: LocalizedText;
  badge_color: string;
}
