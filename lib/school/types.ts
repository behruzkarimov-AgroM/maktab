// Client-safe types for the school management system (SIS). No server imports here.
import type { LocalizedText } from "@/lib/types";

export type SchoolRole = "super_admin" | "school_admin" | "teacher" | "parent" | "student";
export const SCHOOL_ROLES: SchoolRole[] = ["super_admin", "school_admin", "teacher", "parent", "student"];
export const DIRECTOR_ROLES: SchoolRole[] = ["super_admin", "school_admin"];
/** Portal area per role: where /school redirects to. */
export type PortalArea = "director" | "teacher" | "family";
export const areaOf = (r: SchoolRole): PortalArea => (r === "teacher" ? "teacher" : r === "parent" || r === "student" ? "family" : "director");

export interface SchoolSession {
  id: string;
  email: string;
  name: string;
  role: SchoolRole;
  demo: boolean;
  /** teachers.id of the signed-in teacher (role teacher), else null */
  teacherId: string | null;
  /** students visible to this account: children (parent) or self (student); [] otherwise */
  studentIds: string[];
  /** true while the account still uses the temporary password issued by a director (the API then only allows /me, change-password, logout) */
  mustChangePassword?: boolean;
}

export type AttendanceStatus = "present" | "absent" | "late" | "excused" | "sick";
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ["present", "absent", "late", "excused", "sick"];
export type StudentStatus = "active" | "transferred" | "graduated" | "expelled";
export const STUDENT_STATUSES: StudentStatus[] = ["active", "transferred", "graduated", "expelled"];
export type TeacherStatus = "active" | "inactive";
export type Gender = "m" | "f";
export type GradeKind = "daily" | "quiz" | "test" | "exam" | "homework" | "term" | "year";
export const GRADE_KINDS: GradeKind[] = ["daily", "quiz", "test", "exam", "homework", "term", "year"];
export type GuardianRelation = "mother" | "father" | "guardian" | "parent" | "other";
export type Audience = "all" | "teachers" | "parents" | "students" | "class";
export const AUDIENCES: Audience[] = ["all", "teachers", "parents", "students", "class"];
export type BehaviorKind = "positive" | "negative" | "neutral";
export type RiskFlag = "low_attendance" | "low_average" | "absence_streak";

/** ISO calendar date "YYYY-MM-DD" and time "HH:MM:SS" (as returned by PostgREST). */
export type DateStr = string;

export interface SchoolYear {
  id: string;
  name: string;
  start_date: DateStr;
  end_date: DateStr;
  is_current: boolean;
  grading_rules: Partial<GradingRules>;
}
export interface Term {
  id: string;
  year_id: string;
  number: 1 | 2 | 3 | 4;
  name: string;
  start_date: DateStr;
  end_date: DateStr;
  is_locked: boolean;
}
export interface Subject {
  id: string;
  name: LocalizedText;
  short: string;
  sort_order: number;
}
export interface Teacher {
  id: string;
  user_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  subjects: string[];
  hired_at: DateStr | null;
  status: TeacherStatus;
}
export interface SchoolClass {
  id: string;
  year_id: string;
  grade: number;
  letter: string;
  name: string;
  homeroom_teacher_id: string | null;
  room: string | null;
}
export interface TeachingAssignment {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string;
  hours_per_week: number;
}
export interface Student {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  birth_date: DateStr | null;
  gender: Gender | null;
  class_id: string | null;
  student_code: string;
  phone: string | null;
  address: string | null;
  photo_url: string | null;
  status: StudentStatus;
  enrolled_at: DateStr | null;
  notes: string | null;
}
export interface Guardian {
  id: string;
  user_id: string | null;
  full_name: string;
  relation: GuardianRelation;
  phone: string | null;
  email: string | null;
  telegram_chat_id: string | null;
}
export interface StudentGuardian {
  student_id: string;
  guardian_id: string;
  is_primary: boolean;
}
export interface ScheduleSlot {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string | null;
  weekday: 1 | 2 | 3 | 4 | 5 | 6;
  lesson_no: number;
  start_time: string;
  end_time: string;
  room: string | null;
}
export interface Lesson {
  id: string;
  slot_id: string | null;
  class_id: string;
  subject_id: string;
  teacher_id: string | null;
  date: DateStr;
  lesson_no: number;
  topic: string | null;
  homework: string | null;
}
export interface AttendanceRecord {
  id: string;
  student_id: string;
  class_id: string;
  date: DateStr;
  lesson_no: number | null;
  status: AttendanceStatus;
  minutes_late: number;
  note: string | null;
  marked_by: string | null;
  marked_at: string;
}
export interface GradeEntry {
  id: string;
  student_id: string;
  class_id: string;
  subject_id: string;
  term_id: string;
  date: DateStr;
  kind: GradeKind;
  /** 5-point scale, 1..5 (halves allowed, e.g. 4.5) */
  score: number;
  max_score: number;
  /** optional percent mode (0..100); the 5-point `score` is always present */
  percent: number | null;
  weight: number;
  comment: string | null;
  teacher_id: string | null;
  created_at: string;
}
export interface TermGrade {
  student_id: string;
  subject_id: string;
  term_id: string;
  class_id: string;
  /** teacher-confirmed final grade 1..5 (null until confirmed) */
  value: number | null;
  /** auto-computed suggestion (2 decimals) at the moment of confirmation */
  suggested: number | null;
  is_confirmed: boolean;
  confirmed_by: string | null;
  /** why the confirmed value differs from the suggestion (optional, max 300 chars) */
  override_reason: string | null;
  updated_at: string;
}
export interface Announcement {
  id: string;
  audience: Audience;
  class_id: string | null;
  title: string;
  body: string;
  author_id: string | null;
  publish_at: string;
  pinned: boolean;
  created_at: string;
}
export interface Notification {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}
/** per-account notification switches (table school_notification_prefs); no row = all true */
export interface NotificationPrefs {
  user_id: string;
  telegram: boolean;
  email: boolean;
  absence: boolean;
  low_grade: boolean;
  announcements: boolean;
  updated_at: string;
}
export type PrefsFields = Omit<NotificationPrefs, "user_id" | "updated_at">;
export const DEFAULT_PREFS: PrefsFields = { telegram: true, email: true, absence: true, low_grade: true, announcements: true };
export interface BehaviorNote {
  id: string;
  student_id: string;
  class_id: string | null;
  teacher_id: string | null;
  date: DateStr;
  kind: BehaviorKind;
  text: string;
  created_at: string;
}

export interface TableRows {
  school_years: SchoolYear;
  terms: Term;
  subjects: Subject;
  teachers: Teacher;
  classes: SchoolClass;
  teaching_assignments: TeachingAssignment;
  students: Student;
  guardians: Guardian;
  student_guardians: StudentGuardian;
  schedule_slots: ScheduleSlot;
  lessons: Lesson;
  attendance: AttendanceRecord;
  grade_entries: GradeEntry;
  term_grades: TermGrade;
  announcements: Announcement;
  notifications: Notification;
  behavior_notes: BehaviorNote;
  school_notification_prefs: NotificationPrefs;
}
export type TableName = keyof TableRows;

/* ------------------------------------------------------------------ */
/* Grading                                                              */
/* ------------------------------------------------------------------ */

export interface GradingRules {
  /** only "half_up" is implemented: 3.5 -> 4, 4.49 -> 4 */
  rounding: "half_up";
  /** entry kinds ignored when computing averages (they are final grades themselves) */
  excludeKinds: GradeKind[];
  /** default `weight` applied by the API when a client omits it */
  defaultWeights: Record<GradeKind, number>;
  /** below this number of entries a term suggestion is null (not enough evidence) */
  minEntries: number;
  /** attendance percent below this is a risk flag */
  attendanceRiskPct: number;
  /** average below this is a risk flag */
  averageRisk: number;
  /** trailing consecutive `absent` days that raise the absence_streak flag */
  absenceStreak: number;
}

/* ------------------------------------------------------------------ */
/* API payload shapes (see docs/SIS.md)                                  */
/* ------------------------------------------------------------------ */

export interface ApiOk {
  ok: true;
}
export interface ApiErr {
  ok: false;
  error: string;
  message?: string;
  fields?: string[];
}

export interface StudentListItem extends Student {
  class_name: string | null;
  attendance_percent?: number | null;
  average?: number | null;
  risk?: RiskFlag[];
}
export interface StudentDetail extends StudentListItem {
  guardians: (Guardian & { is_primary: boolean })[];
}

export interface AttendanceSheetRow {
  student_id: string;
  last_name: string;
  first_name: string;
  status: AttendanceStatus | null;
  minutes_late: number;
  note: string | null;
  marked_at: string | null;
}
export interface AttendanceDay {
  class_id: string;
  date: DateStr;
  lesson_no: number | null;
  locked_for_you: boolean;
  rows: AttendanceSheetRow[];
}
export interface AttendanceSummaryRow {
  student_id: string;
  last_name: string;
  first_name: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  sick: number;
  total: number;
  percent: number | null;
  streak: number;
}

export interface GradebookColumn {
  date: DateStr;
  kind: GradeKind;
}
export interface GradebookRow {
  student_id: string;
  last_name: string;
  first_name: string;
  entries: GradeEntry[];
  average: number | null;
  suggested: number | null;
  term_grade: TermGrade | null;
}
export interface Gradebook {
  class_id: string;
  subject_id: string;
  term_id: string;
  term_locked: boolean;
  can_edit: boolean;
  rows: GradebookRow[];
  class_average: number | null;
}

export interface PerformancePoint {
  term_id: string;
  number: number;
  name: string;
  average: number | null;
  count: number;
}
export interface SubjectPerformance {
  subject_id: string;
  subject: LocalizedText;
  average: number | null;
  count: number;
  term_values: (number | null)[];
  year_value: number | null;
}
export interface StudentPerformance {
  student_id: string;
  year_id: string;
  overall_average: number | null;
  gpa: number | null;
  percent: number | null;
  rank_in_class: number | null;
  class_size: number;
  trend: PerformancePoint[];
  subjects: SubjectPerformance[];
  attendance: { present: number; absent: number; late: number; excused: number; sick: number; total: number; percent: number | null; streak: number };
  risk: RiskFlag[];
}

export interface RiskRow {
  student_id: string;
  name: string;
  class_id: string | null;
  class_name: string | null;
  flags: RiskFlag[];
  attendance_percent: number | null;
  average: number | null;
  streak: number;
}

export interface ReportCard {
  student: StudentListItem;
  year: SchoolYear;
  term: Term | null;
  generated_at: string;
  subjects: { subject_id: string; subject: LocalizedText; teacher: string | null; average: number | null; term_grade: number | null; year_grade: number | null }[];
  gpa: number | null;
  rank_in_class: number | null;
  class_size: number;
  attendance: StudentPerformance["attendance"];
  homeroom_teacher: string | null;
}

export interface DashboardData {
  role: SchoolRole;
  year: SchoolYear | null;
  term: Term | null;
  today: DateStr;
  cards: { key: string; value: number | string | null; hint?: string }[];
  /** director: attendance % per class today / last 7 days etc. Other roles may get a subset. */
  charts: {
    attendanceByClass?: { class_id: string; class_name: string; percent: number | null }[];
    attendanceTrend?: { date: DateStr; percent: number | null }[];
    gradeDistribution?: { score: number; count: number }[];
    subjectAverages?: { subject_id: string; subject: LocalizedText; average: number | null }[];
  };
  risk: RiskRow[];
  /** teacher: classes that still have no attendance for today */
  pending?: { class_id: string; class_name: string }[];
  /** parent/student */
  children?: { student: StudentListItem; today_status: AttendanceStatus | null; average: number | null; attendance_percent: number | null; risk: RiskFlag[] }[];
  announcements: Announcement[];
}

/* import */
export interface ImportRowResult {
  row: number;
  ok: boolean;
  errors: string[];
  duplicate: "none" | "student_code" | "name_birth";
  action: "create" | "skip" | "invalid";
  data?: Partial<Student> & { class_name?: string | null; guardian_name?: string | null; guardian_phone?: string | null };
}
export interface ImportPreview {
  total: number;
  valid: number;
  duplicates: number;
  invalid: number;
  rows: ImportRowResult[];
}
