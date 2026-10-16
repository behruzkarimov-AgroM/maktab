// zod schemas for every SIS API payload / query (zod v4). The same schemas document the contract in docs/SIS.md.
import { z } from "zod";
import { ATTENDANCE_STATUSES, AUDIENCES, GRADE_KINDS } from "./types";

const text = (max: number) => z.string().trim().max(max);
const req = (min: number, max: number) => z.string().trim().min(min).max(max);
/** empty string -> null for optional text fields */
const optText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable().optional());

export const uuid = z.uuid();
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "bad date");
export const timeStr = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
const optDate = z.preprocess((v) => (v === "" ? null : v), dateStr.nullable().optional());
const optUuid = z.preprocess((v) => (v === "" ? null : v), uuid.nullable().optional());

export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email().max(320), password: z.string().min(1).max(200) });

/* ---------- reference data ---------- */
export const yearSchema = z.object({
  name: req(3, 40),
  start_date: dateStr,
  end_date: dateStr,
  is_current: z.boolean().optional(),
  grading_rules: z
    .object({
      minEntries: z.number().int().min(1).max(20).optional(),
      attendanceRiskPct: z.number().min(0).max(100).optional(),
      averageRisk: z.number().min(1).max(5).optional(),
      absenceStreak: z.number().int().min(1).max(20).optional(),
      defaultWeights: z.record(z.enum(GRADE_KINDS), z.number().positive().max(10)).optional(),
    })
    .optional(),
});
export const termSchema = z.object({
  year_id: uuid,
  number: z.number().int().min(1).max(4),
  name: req(1, 60),
  start_date: dateStr,
  end_date: dateStr,
});
export const termLockSchema = z.object({ term_id: uuid, locked: z.boolean() });

export const subjectSchema = z.object({
  name: z.object({ uz: req(1, 80), ru: req(1, 80), en: req(1, 80) }),
  short: text(12).optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
});
export const classSchema = z.object({
  year_id: uuid.optional(),
  grade: z.number().int().min(1).max(11),
  letter: req(1, 3),
  homeroom_teacher_id: optUuid,
  room: optText(20),
});
export const teacherSchema = z.object({
  full_name: req(2, 120),
  phone: optText(30),
  email: z.preprocess((v) => (v === "" ? null : v), z.string().trim().email().max(320).nullable().optional()),
  subjects: z.array(uuid).max(12).optional(),
  hired_at: optDate,
  status: z.enum(["active", "inactive"]).optional(),
});
export const assignmentSchema = z.object({
  class_id: uuid,
  subject_id: uuid,
  teacher_id: uuid,
  hours_per_week: z.number().int().min(1).max(12).optional(),
});

/* ---------- people ---------- */
export const studentSchema = z.object({
  first_name: req(1, 80),
  last_name: req(1, 80),
  middle_name: optText(80),
  birth_date: optDate,
  gender: z.enum(["m", "f"]).nullable().optional(),
  class_id: optUuid,
  student_code: z.string().trim().min(2).max(30).optional(),
  phone: optText(30),
  address: optText(300),
  /** http(s) link or a site-relative path only (no javascript:/data: URLs) */
  photo_url: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(500).regex(/^(https?:\/\/[^\s]+|\/(?!\/)[^\s]*)$/i).nullable().optional()),
  status: z.enum(["active", "transferred", "graduated", "expelled"]).optional(),
  enrolled_at: optDate,
  notes: optText(2000),
});
export const studentPatchSchema = studentSchema.partial().refine((o) => Object.keys(o).length > 0, "empty");
export const guardianSchema = z.object({
  full_name: req(2, 120),
  relation: z.enum(["mother", "father", "guardian", "parent", "other"]).optional(),
  phone: optText(30),
  email: z.preprocess((v) => (v === "" ? null : v), z.string().trim().email().max(320).nullable().optional()),
  telegram_chat_id: z.preprocess((v) => (v === "" ? null : v), z.string().trim().regex(/^-?\d{4,20}$/).nullable().optional()),
  /** when given, the guardian is linked to this student */
  student_id: uuid.optional(),
  is_primary: z.boolean().optional(),
});
export const guardianLinkSchema = z.object({ student_id: uuid, guardian_id: uuid, is_primary: z.boolean().default(false) });

/* ---------- account / password flows ---------- */
export const changePasswordSchema = z.object({ current_password: z.string().min(1).max(200), new_password: z.string().min(1).max(200) });
export const requestResetSchema = z.object({ email: z.string().trim().toLowerCase().email().max(320) });
export const completeResetSchema = z
  .object({
    /** PKCE `code` from the e-mail redirect (same browser) */
    code: z.string().min(1).max(600).optional(),
    /** `token_hash` from the customised e-mail template (any browser) */
    token_hash: z.string().min(8).max(600).optional(),
    password: z.string().min(1).max(200),
    /** demo mode only */
    email: z.string().trim().toLowerCase().email().max(320).optional(),
  })
  .refine((o) => !!o.code || !!o.token_hash, { message: "code or token_hash required", path: ["code"] });
export const inviteGuardianSchema = z
  .object({
    guardian_id: uuid.optional(),
    full_name: req(2, 120).optional(),
    relation: z.enum(["mother", "father", "guardian", "parent", "other"]).optional(),
    phone: optText(30),
    email: z.string().trim().toLowerCase().email().max(320),
    student_ids: z.array(uuid).max(10).default([]),
    is_primary: z.boolean().optional(),
    password: z.string().min(8).max(100).optional(),
  })
  .refine((o) => !!o.guardian_id || (!!o.full_name && o.student_ids.length > 0), { message: "guardian_id, or full_name + student_ids", path: ["guardian_id"] });
export const prefsSchema = z
  .object({
    telegram: z.boolean().optional(),
    email: z.boolean().optional(),
    absence: z.boolean().optional(),
    low_grade: z.boolean().optional(),
    announcements: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, "empty");
export const excuseAcceptSchema = z.object({ notificationId: uuid });
export const excuseRejectSchema = z.object({ notificationId: uuid, comment: z.string().trim().min(3).max(300) });
export const classAverageQuery = z.object({ student: uuid, term: uuid.optional() });

export const accountSchema = z.object({
  kind: z.enum(["teacher", "guardian", "student"]),
  id: uuid,
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(8).max(100).optional(),
});
export const resetPasswordSchema = z.object({ user_id: z.string().min(1).max(80), password: z.string().min(8).max(100).optional() });

/* ---------- schedule & lessons ---------- */
export const slotSchema = z.object({
  class_id: uuid,
  subject_id: uuid,
  teacher_id: optUuid,
  weekday: z.number().int().min(1).max(6),
  lesson_no: z.number().int().min(1).max(8),
  start_time: timeStr,
  end_time: timeStr,
  room: optText(20),
});
export const lessonSchema = z.object({
  class_id: uuid,
  subject_id: uuid,
  date: dateStr,
  lesson_no: z.number().int().min(1).max(8),
  topic: optText(300),
  homework: optText(1000),
});

/* ---------- attendance ---------- */
export const attendanceRecordSchema = z.object({
  student_id: uuid,
  status: z.enum(ATTENDANCE_STATUSES),
  minutes_late: z.number().int().min(0).max(240).optional(),
  note: optText(200),
});
export const attendanceBulkSchema = z.object({
  class_id: uuid,
  date: dateStr,
  lesson_no: z.number().int().min(1).max(8).nullable().default(null),
  records: z.array(attendanceRecordSchema).min(1).max(100),
});

/* ---------- grades ---------- */
export const gradeEntrySchema = z.object({
  id: uuid.optional(),
  delete: z.boolean().optional(),
  student_id: uuid.optional(),
  date: dateStr.optional(),
  kind: z.enum(GRADE_KINDS).default("daily"),
  score: z.number().min(1).max(5).optional(),
  weight: z.number().positive().max(10).optional(),
  comment: optText(300),
});
export const gradesBulkSchema = z.object({
  class_id: uuid,
  subject_id: uuid,
  term_id: uuid,
  entries: z.array(gradeEntrySchema).min(1).max(300),
});
export const termGradesBulkSchema = z.object({
  class_id: uuid,
  subject_id: uuid,
  term_id: uuid,
  rows: z
    .array(z.object({
      student_id: uuid,
      value: z.number().int().min(1).max(5).nullable(),
      /** why the confirmed value differs from the suggestion; stored in term_grades.override_reason */
      override_reason: z.string().trim().max(300).nullable().optional(),
    }))
    .min(1)
    .max(100),
});

/* ---------- communication ---------- */
export const announcementSchema = z
  .object({
    audience: z.enum(AUDIENCES).default("all"),
    class_id: optUuid,
    title: req(1, 160),
    body: text(4000).default(""),
    publish_at: z.string().datetime({ offset: true }).optional(),
    pinned: z.boolean().default(false),
  })
  .refine((o) => (o.audience === "class") === !!o.class_id, { message: "class_id required exactly for audience=class", path: ["class_id"] });
export const notificationReadSchema = z.object({ ids: z.array(uuid).max(100).optional(), all: z.boolean().optional() }).refine((o) => !!o.all || !!o.ids?.length, "empty");

/* ---------- import ---------- */
export const importCommitSchema = z.object({
  rows: z
    .array(
      z.object({
        first_name: req(1, 80),
        last_name: req(1, 80),
        middle_name: optText(80),
        birth_date: optDate,
        gender: z.enum(["m", "f"]).nullable().optional(),
        class_name: optText(12),
        student_code: z.string().trim().max(30).nullable().optional(),
        phone: optText(30),
        address: optText(300),
        guardian_name: optText(120),
        guardian_phone: optText(30),
      }),
    )
    .min(1)
    .max(1000),
  /** "skip" ignores duplicates (default), "update" patches the existing student */
  on_duplicate: z.enum(["skip", "update"]).default("skip"),
});

/* ---------- queries (all values arrive as strings) ---------- */
const num = z.coerce.number().int();
export const pageQuery = z.object({ limit: num.min(1).max(500).optional(), offset: num.min(0).optional(), q: text(80).optional() });
export const studentsQuery = pageQuery.extend({
  class_id: uuid.optional(),
  status: z.enum(["active", "transferred", "graduated", "expelled"]).optional(),
  with_stats: z.enum(["1", "0"]).optional(),
  id: uuid.optional(),
});
export const attendanceQuery = z.object({
  class_id: uuid.optional(),
  student_id: uuid.optional(),
  date: dateStr.optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  lesson_no: num.min(1).max(8).optional(),
});
export const gradebookQuery = z.object({ class_id: uuid, subject_id: uuid, term_id: uuid });
export const gradesQuery = z.object({ student_id: uuid.optional(), class_id: uuid.optional(), subject_id: uuid.optional(), term_id: uuid.optional() });
export const termGradesQuery = z.object({ class_id: uuid, subject_id: uuid, term_id: uuid });
export const performanceQuery = z.object({ student_id: uuid, year_id: uuid.optional() });
export const riskQuery = z.object({ class_id: uuid.optional(), limit: num.min(1).max(200).optional() });
export const reportCardQuery = z.object({ student_id: uuid, term_id: uuid.optional() });
export const classReportQuery = z.object({ class_id: uuid, term_id: uuid.optional(), from: dateStr.optional(), to: dateStr.optional() });
export const scheduleQuery = z.object({ class_id: uuid.optional(), teacher_id: uuid.optional() });
export const lessonsQuery = z.object({ class_id: uuid, from: dateStr.optional(), to: dateStr.optional() });
export const classesQuery = z.object({ year_id: uuid.optional() });
export const assignmentsQuery = z.object({ class_id: uuid.optional(), teacher_id: uuid.optional() });
export const announcementsQuery = z.object({ limit: num.min(1).max(100).optional() });
export const notificationsQuery = z.object({ unread: z.enum(["1", "0"]).optional(), limit: num.min(1).max(100).optional() });
