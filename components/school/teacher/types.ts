// Shapes of /api/school/teacher/* responses and of /me used by the teacher portal.
import type { AttendanceStatus, GradingRules, RiskFlag, ScheduleSlot, Term } from "@/lib/school/types";

export interface MeData {
  today: string;
  year: { id: string; name: string; start_date: string; end_date: string } | null;
  term: Term | null;
  terms: Term[];
  rules: GradingRules;
}

export interface TClass {
  id: string;
  name: string;
  grade: number;
  letter: string;
  room: string | null;
  homeroom: boolean;
  subject_ids: string[];
  student_count: number;
  attendance_percent: number | null;
  average: number | null;
  risk_count: number;
  today: { marked: number; counts: Record<AttendanceStatus, number> };
  marked_today: boolean;
}
export interface TAssignment {
  class_id: string;
  class_name: string;
  grade: number;
  subject_id: string;
  hours_per_week: number;
}
export interface TLesson {
  slot: ScheduleSlot;
  class_name: string;
  attendance_marked: boolean;
  topic: string | null;
  homework: string | null;
  lesson_filled: boolean;
}
export interface TRisk {
  student_id: string;
  name: string;
  class_id: string | null;
  class_name: string | null;
  flags: RiskFlag[];
  attendance_percent: number | null;
  average: number | null;
  streak: number;
}
export interface TPendingTerm {
  class_id: string;
  class_name: string;
  subject_id: string;
  term_id: string;
  total: number;
  confirmed: number;
  locked: boolean;
}
export interface Overview {
  teacher_id: string | null;
  today: string;
  term: Term | null;
  assignments: TAssignment[];
  classes: TClass[];
  today_lessons: TLesson[];
  risk: TRisk[];
  pending_terms: TPendingTerm[];
}
