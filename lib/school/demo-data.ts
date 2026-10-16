// Deterministic demo data for the school portal (hash based, NO Math.random). Same reference ids as the SQL seed.
// generateDemoData(today) is pure: the same `today` always yields the same rows.
import { addDays, DEFAULT_RULES, suggestTermGrade, tashkentToday, weekdayOf } from "./grading";
import type {
  Announcement, AttendanceRecord, AttendanceStatus, BehaviorNote, Gender, GradeEntry, GradeKind, Guardian, Lesson, Notification, ScheduleSlot,
  SchoolClass, SchoolRole, SchoolYear, Student, StudentGuardian, Subject, TableRows, Teacher, TeachingAssignment, Term, TermGrade,
} from "./types";

export type DemoTables = { [K in keyof TableRows]: TableRows[K][] };

export interface DemoAccount {
  id: string;
  email: string;
  password: string;
  name: string;
  role: SchoolRole;
}
export const DEMO_PASSWORD = "demo1234";
export const DEMO_ACCOUNTS: DemoAccount[] = [
  { id: "demo-director", email: "director@demo.uz", password: DEMO_PASSWORD, name: "Demo Director", role: "school_admin" },
  { id: "demo-teacher", email: "teacher@demo.uz", password: DEMO_PASSWORD, name: "Dilnoza Karimova", role: "teacher" },
  { id: "demo-parent", email: "parent@demo.uz", password: DEMO_PASSWORD, name: "Gulnora Rahimova", role: "parent" },
  { id: "demo-student", email: "student@demo.uz", password: DEMO_PASSWORD, name: "Demo Student", role: "student" },
];

/* ------------------------------ hashing ------------------------------ */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return h >>> 0;
}
/** deterministic pseudo random in [0,1) */
export const rnd = (s: string): number => hash(s) / 4294967296;
const pick = <T,>(arr: readonly T[], s: string): T => arr[hash(s) % arr.length];

/* ------------------------------ ids ------------------------------ */
export const refId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const uid = (kind: number, n: number) => `${kind.toString(16).padStart(8, "0")}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
export const YEAR_ID = refId(9001);
export const TERM_IDS = [refId(9011), refId(9012), refId(9013), refId(9014)];
export const SUBJECT_IDS = Array.from({ length: 12 }, (_, i) => refId(9101 + i));
export const CLASS_IDS = Array.from({ length: 14 }, (_, i) => refId(9201 + i));

/* ------------------------------ reference ------------------------------ */
const L = (uz: string, ru: string, en: string) => ({ uz, ru, en });
const SUBJECT_DEFS: [string, ReturnType<typeof L>, string][] = [
  ["Ona", L("Ona tili va adabiyot", "Родной язык и литература", "Native language & literature"), "Ona"],
  ["Rus", L("Rus tili", "Русский язык", "Russian"), "Rus"],
  ["Ing", L("Ingliz tili", "Английский язык", "English"), "Ing"],
  ["Mat", L("Matematika", "Математика", "Mathematics"), "Mat"],
  ["Fiz", L("Fizika", "Физика", "Physics"), "Fiz"],
  ["Kim", L("Kimyo", "Химия", "Chemistry"), "Kim"],
  ["Bio", L("Biologiya", "Биология", "Biology"), "Bio"],
  ["Tar", L("Tarix", "История", "History"), "Tar"],
  ["Geo", L("Geografiya", "География", "Geography"), "Geo"],
  ["Inf", L("Informatika", "Информатика", "Computer science"), "Inf"],
  ["JT", L("Jismoniy tarbiya", "Физкультура", "Physical education"), "JT"],
  ["San", L("Tasviriy san'at", "ИЗО", "Art"), "San"],
];
const CLASS_DEFS: [number, string, string][] = [
  [1, "A", "101"], [1, "B", "102"], [2, "A", "103"], [2, "B", "104"], [3, "A", "105"], [3, "B", "106"], [4, "A", "201"],
  [5, "A", "202"], [6, "A", "203"], [7, "A", "204"], [8, "A", "301"], [9, "A", "302"], [10, "A", "303"], [11, "A", "304"],
];

/** academic year start (calendar year of September) for a given "today" */
export const academicStartYear = (today: string): number => {
  const y = Number(today.slice(0, 4));
  return Number(today.slice(5, 7)) >= 9 ? y : y - 1;
};

const MALE = ["Akbar", "Bobur", "Davron", "Eldor", "Farhod", "Gʻayrat", "Hasan", "Ibrohim", "Jasur", "Kamol", "Laziz", "Mansur", "Nodir", "Otabek", "Pulat", "Rustam", "Sardor", "Timur", "Ulugʻbek", "Valijon", "Xurshid", "Yusuf", "Zafar", "Aziz", "Bekzod", "Doniyor", "Jahongir", "Sherzod", "Shohruh", "Umid"];
const FEMALE = ["Aziza", "Barno", "Dildora", "Feruza", "Gulnoza", "Hilola", "Iroda", "Jasmina", "Kamola", "Lola", "Madina", "Nigora", "Olima", "Parvina", "Robiya", "Sevara", "Tahmina", "Umida", "Vazira", "Xadicha", "Yulduz", "Zarina", "Malika", "Nodira", "Shahnoza", "Sitora", "Dilfuza", "Munisa", "Laylo", "Mohira"];
const SURNAMES = ["Karimov", "Rahimov", "Yusupov", "Abdullayev", "Tursunov", "Qodirov", "Saidov", "Ergashev", "Nazarov", "Ismoilov", "Hamidov", "Mirzayev", "Normatov", "Sobirov", "Xolmatov", "Ashurov", "Bobojonov", "Davlatov", "Fayzullayev", "Gafurov", "Jalilov", "Komilov", "Murodov", "Omonov", "Rasulov", "Safarov", "Toshev", "Umarov", "Valiyev", "Zokirov"];
const STREETS = ["Alisher Navoiy", "Mustaqillik", "Termiziylar", "Islom Karimov", "Amir Temur", "Boysun", "Surxon", "Barkamol", "Navbahor", "Bunyodkor"];
const femaleSurname = (m: string) => (m.endsWith("ov") ? `${m}a` : m.endsWith("ev") ? `${m}a` : m);

const TEACHER_SPECS: [number, number][] = [[0, 3], [1, 2], [2, 3], [3, 4], [4, 2], [5, 1], [6, 2], [7, 2], [8, 1], [9, 2], [10, 2], [11, 1]]; // [subject index, count] = 25 teachers
const TEACHER_NAMES = [
  "Dilnoza Karimova", "Malika Abdullayeva", "Shahlo Tursunova", "Gulchehra Saidova", "Nargiza Yusupova", "Sanjar Rahimov", "Mavluda Ergasheva", "Zuhra Nazarova",
  "Bahodir Qodirov", "Lola Ismoilova", "Rustam Hamidov", "Feruza Mirzayeva", "Dilshod Normatov", "Sevara Sobirova", "Anvar Xolmatov", "Nodira Ashurova", "Jahongir Bobojonov",
  "Kamola Davlatova", "Otabek Fayzullayev", "Mohira Gafurova", "Sherzod Jalilov", "Yulduz Komilova", "Bekzod Murodov", "Sitora Omonova", "Davron Rasulov",
];

function subjectsForGrade(g: number): number[] {
  if (g <= 2) return [0, 1, 2, 3, 10, 11];
  if (g <= 4) return [0, 1, 2, 3, 9, 10, 11];
  if (g <= 6) return [0, 1, 2, 3, 6, 7, 8, 9, 10, 11];
  if (g === 7) return [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11];
  return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
}
function hoursFor(si: number, g: number): number {
  if (si === 0) return g <= 4 ? 5 : 3;
  if (si === 1) return 2;
  if (si === 2) return 3;
  if (si === 3) return 4;
  if (si === 9 || si === 11) return 1;
  return 2;
}
const lessonsPerDay = (g: number) => (g <= 4 ? 4 : 6);
const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}:00`;
const lessonStart = (n: number) => 8 * 60 + 30 + (n - 1) * 55;

/* ------------------------------ generator ------------------------------ */
export interface DemoBundle {
  tables: DemoTables;
  today: string;
  /** reference "now" the data was generated for */
  ids: { demoTeacherId: string; demoGuardianId: string; demoStudentId: string; demoChildIds: string[] };
}

export function generateDemoData(today: string = tashkentToday()): DemoBundle {
  const y = academicStartYear(today);
  const year: SchoolYear = { id: YEAR_ID, name: `${y}-${y + 1}`, start_date: `${y}-09-01`, end_date: `${y + 1}-05-31`, is_current: true, grading_rules: {} };
  const termDates: [string, string][] = [
    [`${y}-09-01`, `${y}-11-02`], [`${y}-11-10`, `${y}-12-28`], [`${y + 1}-01-11`, `${y + 1}-03-15`], [`${y + 1}-03-24`, `${y + 1}-05-26`],
  ];
  const terms: Term[] = termDates.map(([s, e], i) => ({
    id: TERM_IDS[i], year_id: YEAR_ID, number: (i + 1) as 1 | 2 | 3 | 4, name: `${i + 1}-chorak`, start_date: s, end_date: e, is_locked: e < today,
  }));
  const ref = today < year.start_date ? year.start_date : today > year.end_date ? addDays(year.end_date, 1) : today;
  const termOf = (d: string) => terms.find((t) => d >= t.start_date && d <= t.end_date) ?? null;
  const isSchoolDay = (d: string) => weekdayOf(d) <= 6 && !!termOf(d);

  const subjects: Subject[] = SUBJECT_DEFS.map(([, name, short], i) => ({ id: SUBJECT_IDS[i], name, short, sort_order: i + 1 }));

  // ---- teachers
  const teachers: Teacher[] = [];
  const teachersBySubject: Teacher[][] = SUBJECT_DEFS.map(() => []);
  let ti = 0;
  for (const [si, count] of TEACHER_SPECS) {
    for (let c = 0; c < count; c++) {
      const t: Teacher = {
        id: uid(0x10, ti + 1), user_id: ti === 0 ? "demo-teacher" : null, full_name: TEACHER_NAMES[ti], phone: `+99890${String(1000000 + hash(`tp${ti}`) % 8999999)}`,
        email: ti === 0 ? "teacher@demo.uz" : null, subjects: [SUBJECT_IDS[si]], hired_at: `${2008 + (hash(`th${ti}`) % 15)}-09-01`, status: "active",
      };
      teachers.push(t);
      teachersBySubject[si].push(t);
      ti++;
    }
  }

  // ---- classes + assignments
  const classes: SchoolClass[] = [];
  const assignments: TeachingAssignment[] = [];
  let an = 0;
  CLASS_DEFS.forEach(([grade, letter, room], ci) => {
    const homeroom = teachersBySubject[0][ci % teachersBySubject[0].length];
    classes.push({ id: CLASS_IDS[ci], year_id: YEAR_ID, grade, letter, name: `${grade}${letter}`, homeroom_teacher_id: homeroom.id, room });
    for (const si of subjectsForGrade(grade)) {
      const pool = teachersBySubject[si];
      const teacher = si === 0 ? homeroom : pool[(ci + si) % pool.length];
      assignments.push({ id: uid(0x13, ++an), class_id: CLASS_IDS[ci], subject_id: SUBJECT_IDS[si], teacher_id: teacher.id, hours_per_week: hoursFor(si, grade) });
    }
  });

  // ---- schedule (conflict free for teachers)
  const slots: ScheduleSlot[] = [];
  const busy = new Set<string>(); // `${teacherId}|${weekday}|${lessonNo}`
  // a room hosts one class per lesson (the DB enforces it): shared rooms get numbered siblings ("Sport zal 2")
  const busyRoom = new Set<string>();
  const takeRoom = (base: string, d: number, n: number): string => {
    for (let k = 1; ; k++) {
      const r = k === 1 ? base : `${base} ${k}`;
      const key = `${r.toLowerCase()}|${d}|${n}`;
      if (!busyRoom.has(key)) {
        busyRoom.add(key);
        return r;
      }
    }
  };
  let sn = 0;
  classes.forEach((c, ci) => {
    const units: { si: number; teacher: string }[] = [];
    for (const a of assignments.filter((x) => x.class_id === c.id)) {
      const si = SUBJECT_IDS.indexOf(a.subject_id);
      for (let h = 0; h < a.hours_per_week; h++) units.push({ si, teacher: a.teacher_id });
    }
    const cap = lessonsPerDay(c.grade);
    const perDay = Array.from({ length: 6 }, (_, d) => Math.min(cap, Math.floor(units.length / 6) + (d < units.length % 6 ? 1 : 0)));
    const remaining = units.slice().sort((a, b) => hash(`u${ci}${a.si}${a.teacher}`) - hash(`u${ci}${b.si}${b.teacher}`));
    for (let d = 1; d <= 6; d++) {
      const todaySubjects = new Set<number>();
      for (let n = 1; n <= perDay[d - 1]; n++) {
        const free = (u: { teacher: string }) => !busy.has(`${u.teacher}|${d}|${n}`);
        let idx = remaining.findIndex((u) => free(u) && !todaySubjects.has(u.si));
        if (idx < 0) idx = remaining.findIndex(free);
        if (idx < 0) continue;
        const [u] = remaining.splice(idx, 1);
        busy.add(`${u.teacher}|${d}|${n}`);
        todaySubjects.add(u.si);
        slots.push({
          id: uid(0x14, ++sn), class_id: c.id, subject_id: SUBJECT_IDS[u.si], teacher_id: u.teacher, weekday: d as 1, lesson_no: n,
          start_time: hhmm(lessonStart(n)), end_time: hhmm(lessonStart(n) + 45), room: takeRoom(u.si === 10 ? "Sport zal" : u.si === 9 ? "Komp. xona" : c.room ?? `${c.name} xona`, d, n),
        });
      }
    }
  });

  // ---- students (300) + guardians
  const sizes = CLASS_DEFS.map((_, i) => (i < 6 ? 22 : 21));
  const students: Student[] = [];
  const guardians: Guardian[] = [];
  const links: StudentGuardian[] = [];
  let sNum = 0;
  let gNum = 0;
  classes.forEach((c, ci) => {
    for (let k = 0; k < sizes[ci]; k++) {
      sNum++;
      const gender: Gender = hash(`g${sNum}`) % 2 === 0 ? "m" : "f";
      const sur = pick(SURNAMES, `sur${sNum}`);
      const fatherName = pick(MALE, `fa${sNum}`);
      const first = gender === "m" ? pick(MALE, `fn${sNum}`) : pick(FEMALE, `fn${sNum}`);
      const by = y - 6 - c.grade;
      students.push({
        id: uid(0x11, sNum), user_id: null, first_name: first, last_name: gender === "m" ? sur : femaleSurname(sur),
        middle_name: `${fatherName} ${gender === "m" ? "oʻgʻli" : "qizi"}`,
        birth_date: `${by}-${String(1 + (hash(`bm${sNum}`) % 12)).padStart(2, "0")}-${String(1 + (hash(`bd${sNum}`) % 28)).padStart(2, "0")}`,
        gender, class_id: c.id, student_code: `ST-${y}-${String(sNum).padStart(4, "0")}`, phone: c.grade >= 8 ? `+99891${String(1000000 + hash(`sp${sNum}`) % 8999999)}` : null,
        address: `Termiz sh., ${pick(STREETS, `st${sNum}`)} koʻchasi, ${1 + (hash(`ho${sNum}`) % 120)}-uy`, photo_url: null, status: "active",
        enrolled_at: `${y - (c.grade - 1)}-09-01`, notes: null,
      });
      const mother: Guardian = {
        id: uid(0x12, ++gNum), user_id: null, full_name: `${pick(FEMALE, `mo${sNum}`)} ${femaleSurname(sur)}`, relation: "mother",
        phone: `+99893${String(1000000 + hash(`gp${sNum}`) % 8999999)}`, email: null, telegram_chat_id: rnd(`tg${sNum}`) < 0.35 ? String(500000000 + (hash(`tc${sNum}`) % 400000000)) : null,
      };
      guardians.push(mother);
      links.push({ student_id: uid(0x11, sNum), guardian_id: mother.id, is_primary: true });
      if (rnd(`hasfa${sNum}`) < 0.7) {
        const father: Guardian = {
          id: uid(0x12, ++gNum), user_id: null, full_name: `${fatherName} ${sur}`, relation: "father",
          phone: `+99894${String(1000000 + hash(`fp${sNum}`) % 8999999)}`, email: null, telegram_chat_id: null,
        };
        guardians.push(father);
        links.push({ student_id: uid(0x11, sNum), guardian_id: father.id, is_primary: false });
      }
    }
  });

  // demo family: one mother with two children (3A and 7A), one demo student in 9A
  const firstIn = (name: string) => students.find((s) => s.class_id === classes.find((c) => c.name === name)!.id)!;
  const kid1 = firstIn("3A");
  const kid2 = firstIn("7A");
  const demoStudent = firstIn("9A");
  demoStudent.user_id = "demo-student";
  demoStudent.first_name = "Sardor";
  demoStudent.last_name = "Demo";
  kid1.last_name = "Rahimov";
  kid2.last_name = "Rahimova";
  kid2.gender = "f";
  kid2.first_name = "Madina";
  const demoMother: Guardian = { id: uid(0x12, ++gNum), user_id: "demo-parent", full_name: "Gulnora Rahimova", relation: "mother", phone: "+998931234567", email: "parent@demo.uz", telegram_chat_id: null };
  const dropFor = new Set([kid1.id, kid2.id]);
  const keepLinks = links.filter((l) => !dropFor.has(l.student_id));
  const orphan = new Set(links.filter((l) => dropFor.has(l.student_id)).map((l) => l.guardian_id));
  links.length = 0;
  links.push(...keepLinks, { student_id: kid1.id, guardian_id: demoMother.id, is_primary: true }, { student_id: kid2.id, guardian_id: demoMother.id, is_primary: true });
  const guardiansOut = [...guardians.filter((g) => !orphan.has(g.id)), demoMother];

  // ---- attendance (daily mode) for the last 8 weeks, strictly before `ref`
  const from = addDays(ref, -56);
  const days: string[] = [];
  for (let d = from; d < ref; d = addDays(d, 1)) if (isSchoolDay(d)) days.push(d);
  const lastDays = days.slice(-4);
  const forcedStreak = new Set(students.map((s) => s).sort((a, b) => hash(`risk${a.id}`) - hash(`risk${b.id}`)).slice(0, 6).map((s) => s.id));
  forcedStreak.delete(demoStudent.id);
  forcedStreak.delete(kid1.id);
  forcedStreak.delete(kid2.id);
  const attendance: AttendanceRecord[] = [];
  let attN = 0;
  const homeroomUser = (classId: string) => {
    const t = teachers.find((x) => x.id === classes.find((c) => c.id === classId)!.homeroom_teacher_id);
    return t?.user_id ?? t?.id ?? null;
  };
  for (const s of students) {
    const type = rnd(`atype${s.id}`);
    const p = type < 0.04 ? 0.2 : type < 0.2 ? 0.07 : 0.02;
    const streakLen = 3 + (hash(`sl${s.id}`) % 2);
    days.forEach((d, di) => {
      const wd = weekdayOf(d);
      const factor = wd === 1 ? 1.5 : wd === 6 ? 1.2 : wd === 5 ? 1.1 : 1;
      let status: AttendanceStatus = "present";
      let late = 0;
      const week = Math.floor(di / 6);
      const sickBlock = rnd(`sick${s.id}${week}`) < 0.03 && di % 6 >= hash(`ss${s.id}${week}`) % 3 && di % 6 < (hash(`ss${s.id}${week}`) % 3) + 3;
      if (forcedStreak.has(s.id) && di >= days.length - streakLen) status = "absent";
      else if (sickBlock) status = "sick";
      else if (rnd(`ab${s.id}${d}`) < p * factor) {
        const v = rnd(`abk${s.id}${d}`);
        status = v < 0.5 ? "absent" : v < 0.78 ? "sick" : "excused";
      } else if (rnd(`late${s.id}${d}`) < 0.02) {
        status = "late";
        late = 3 + (hash(`lm${s.id}${d}`) % 20);
      }
      attendance.push({
        id: uid(0x20, ++attN), student_id: s.id, class_id: s.class_id!, date: d, lesson_no: null, status, minutes_late: late,
        note: status === "sick" ? "Kasal" : null, marked_by: homeroomUser(s.class_id!), marked_at: `${d}T04:10:00.000Z`,
      });
    });
  }
  void lastDays;

  // ---- grades on real lesson days
  const grades: GradeEntry[] = [];
  let gN = 0;
  const gradeDays = new Map<string, string[]>(); // classId|subjectId -> past lesson dates (term days)
  for (const a of assignments) {
    const wds = slots.filter((x) => x.class_id === a.class_id && x.subject_id === a.subject_id).map((x) => x.weekday as number);
    const ds: string[] = [];
    for (let d = year.start_date; d < ref; d = addDays(d, 1)) if (wds.includes(weekdayOf(d)) && termOf(d)) ds.push(d);
    gradeDays.set(`${a.class_id}|${a.subject_id}`, ds);
  }
  const studentsByClass = new Map<string, Student[]>();
  for (const s of students) (studentsByClass.get(s.class_id!) ?? studentsByClass.set(s.class_id!, []).get(s.class_id!)!).push(s);
  const ability = (sid: string) => {
    const beta = (rnd(`a1${sid}`) + rnd(`a2${sid}`)) / 2;
    return rnd(`a3${sid}`) < 0.08 ? 2.4 + 0.7 * beta : 3.1 + 1.8 * beta;
  };
  const abilityCache = new Map(students.map((s) => [s.id, ability(s.id)]));
  const mkScore = (sid: string, subj: string, key: string) => {
    const x = (abilityCache.get(sid) as number) + (rnd(`aff${sid}${subj}`) - 0.5) * 0.9 + (rnd(`n${key}`) - 0.5) * 1.6;
    return x < 1.5 ? 1 : Math.min(5, Math.max(2, Math.round(x)));
  };
  for (const a of assignments) {
    const ds = gradeDays.get(`${a.class_id}|${a.subject_id}`)!;
    const roster = studentsByClass.get(a.class_id)!;
    ds.forEach((d, di) => {
      const kind: GradeKind = di % 9 === 8 ? "test" : di % 5 === 4 ? "quiz" : rnd(`hw${a.id}${d}`) < 0.12 ? "homework" : "daily";
      const prob = kind === "test" ? 0.97 : kind === "quiz" ? 0.8 : 0.42;
      const weight = DEFAULT_RULES.defaultWeights[kind];
      const term = termOf(d)!;
      for (const s of roster) {
        if (rnd(`gp${s.id}${a.id}${d}`) >= prob) continue;
        grades.push({
          id: uid(0x21, ++gN), student_id: s.id, class_id: a.class_id, subject_id: a.subject_id, term_id: term.id, date: d, kind, score: mkScore(s.id, a.subject_id, `${s.id}${a.id}${d}`),
          max_score: 5, percent: null, weight, comment: null, teacher_id: a.teacher_id, created_at: `${d}T09:00:00.000Z`,
        });
      }
    });
    // finished terms get an exam entry
    for (const t of terms) {
      if (t.end_date >= ref) continue;
      let ed = addDays(t.end_date, -3);
      while (!isSchoolDay(ed)) ed = addDays(ed, -1);
      for (const s of roster) {
        grades.push({
          id: uid(0x21, ++gN), student_id: s.id, class_id: a.class_id, subject_id: a.subject_id, term_id: t.id, date: ed, kind: "exam", score: mkScore(s.id, a.subject_id, `ex${s.id}${a.id}${t.id}`),
          max_score: 5, percent: null, weight: DEFAULT_RULES.defaultWeights.exam, comment: null, teacher_id: a.teacher_id, created_at: `${ed}T09:00:00.000Z`,
        });
      }
    }
  }

  // ---- term grades for finished terms (confirmed)
  const termGrades: TermGrade[] = [];
  const byKey = new Map<string, GradeEntry[]>();
  for (const g of grades) (byKey.get(`${g.student_id}|${g.subject_id}|${g.term_id}`) ?? byKey.set(`${g.student_id}|${g.subject_id}|${g.term_id}`, []).get(`${g.student_id}|${g.subject_id}|${g.term_id}`)!).push(g);
  for (const [key, list] of byKey) {
    const [student_id, subject_id, term_id] = key.split("|");
    const term = terms.find((t) => t.id === term_id)!;
    if (term.end_date >= ref) continue;
    const sug = suggestTermGrade(list);
    if (!sug) continue;
    termGrades.push({
      student_id, subject_id, term_id, class_id: list[0].class_id, value: sug.grade, suggested: sug.average, is_confirmed: true,
      confirmed_by: list[0].teacher_id, override_reason: null, updated_at: `${term.end_date}T12:00:00.000Z`,
    });
  }

  // ---- recent lessons (last 5 school days)
  const lessons: Lesson[] = [];
  const lastSchoolDays = days.slice(-5);
  let ln = 0;
  for (const sl of slots) {
    for (const d of lastSchoolDays) {
      if (weekdayOf(d) !== sl.weekday) continue;
      const sj = subjects.find((x) => x.id === sl.subject_id)!;
      lessons.push({
        id: uid(0x15, ++ln), slot_id: sl.id, class_id: sl.class_id, subject_id: sl.subject_id, teacher_id: sl.teacher_id, date: d, lesson_no: sl.lesson_no,
        topic: `${sj.short}: mavzu ${1 + (hash(`tp${sl.id}${d}`) % 30)}`, homework: rnd(`hwk${sl.id}${d}`) < 0.6 ? `${1 + (hash(`pg${sl.id}${d}`) % 90)}-betdagi mashqlar` : null,
      });
    }
  }

  // ---- announcements, notifications, behavior
  const now = `${today}T06:00:00.000Z`;
  const announcements: Announcement[] = [
    { id: uid(0x23, 1), audience: "all", class_id: null, title: "Oʻquv yilining ikkinchi yarmi uchun yigʻilish", body: "Barcha ota-onalar va oʻqituvchilar uchun umumiy yigʻilish juma kuni soat 15:00 da boʻlib oʻtadi.", author_id: "demo-director", publish_at: now, pinned: true, created_at: now },
    { id: uid(0x23, 2), audience: "teachers", class_id: null, title: "Jurnalni toʻldirish muddati", body: "Har bir chorak oxirigacha barcha baholar elektron jurnalga kiritilishi shart.", author_id: "demo-director", publish_at: now, pinned: false, created_at: now },
    { id: uid(0x23, 3), audience: "parents", class_id: null, title: "Ota-onalar uchun anketa", body: "Maktab xizmatlari sifati boʻyicha qisqa soʻrovnomada ishtirok eting.", author_id: "demo-director", publish_at: now, pinned: false, created_at: now },
    { id: uid(0x23, 4), audience: "class", class_id: kid2.class_id, title: "7A: fizikadan nazorat ishi", body: "Kelasi hafta chorshanba kuni fizikadan nazorat ishi oʻtkaziladi.", author_id: "demo-teacher", publish_at: now, pinned: false, created_at: now },
  ];
  const notifications: Notification[] = [
    { id: uid(0x24, 1), user_id: "demo-parent", type: "announcement", payload: { title: announcements[0].title }, read_at: null, created_at: now },
    { id: uid(0x24, 2), user_id: "demo-teacher", type: "announcement", payload: { title: announcements[1].title }, read_at: null, created_at: now },
  ];
  const behavior_notes: BehaviorNote[] = students.slice(0, 12).map((s, i) => ({
    id: uid(0x22, i + 1), student_id: s.id, class_id: s.class_id, teacher_id: classes.find((c) => c.id === s.class_id)!.homeroom_teacher_id,
    date: days[days.length - 1 - (i % 5)] ?? from, kind: i % 3 === 0 ? "negative" : "positive",
    text: i % 3 === 0 ? "Darsga kechikdi" : "Sinfda faol qatnashdi", created_at: now,
  }));

  return {
    today,
    ids: { demoTeacherId: teachers[0].id, demoGuardianId: demoMother.id, demoStudentId: demoStudent.id, demoChildIds: [kid1.id, kid2.id] },
    tables: {
      school_years: [year], terms, subjects, teachers, classes, teaching_assignments: assignments, students, guardians: guardiansOut,
      student_guardians: links, schedule_slots: slots, lessons, attendance, grade_entries: grades, term_grades: termGrades,
      announcements, notifications, behavior_notes, school_notification_prefs: [],
    },
  };
}
