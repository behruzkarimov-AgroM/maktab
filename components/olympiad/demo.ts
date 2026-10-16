/**
 * DEMO-mode seed data + in-memory store (server side, used only when Supabase is not configured).
 * Never imported by client components.
 */
import type { IssuedTicket, LeaderRow, Olympiad, PublicResult, RegistrationInput } from "./types";

const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString();

export function demoOlympiads(): Olympiad[] {
  const now = Date.now();
  const subjects = [
    { key: "math", name: { uz: "Matematika", ru: "Математика", en: "Mathematics" } },
    { key: "physics", name: { uz: "Fizika", ru: "Физика", en: "Physics" } },
    { key: "english", name: { uz: "Ingliz tili", ru: "Английский язык", en: "English" } },
    { key: "informatics", name: { uz: "Informatika", ru: "Информатика", en: "Informatics" } },
  ];
  return [
    {
      id: "demo-oly-spring",
      title: {
        uz: "Maktab ochiq olimpiadasi",
        ru: "Открытая школьная олимпиада",
        en: "Open School Olympiad",
      },
      description: {
        uz: "5-11 sinf o'quvchilari uchun fanlar bo'yicha ochiq olimpiada. G'oliblar sertifikat va sovrinlar bilan taqdirlanadi.",
        ru: "Открытая олимпиада по предметам для учеников 5-11 классов. Победителей ждут сертификаты и призы.",
        en: "An open subject olympiad for grades 5-11. Winners receive certificates and prizes.",
      },
      rules: {
        uz: "Ruxsatnomani chop eting yoki telefonda ko'rsating. Imtihonga 30 daqiqa oldin keling. Hujjat va qalam olib keling.",
        ru: "Распечатайте пропуск или покажите на телефоне. Приходите за 30 минут. Возьмите документ и ручку.",
        en: "Print your pass or show it on your phone. Arrive 30 minutes early. Bring an ID and a pen.",
      },
      subjects,
      eligibleGrades: [5, 6, 7, 8, 9, 10, 11],
      eventDate: iso(now + 14 * DAY),
      registrationDeadline: iso(now + 10 * DAY),
      location: { uz: "Toshkent, maktab asosiy binosi", ru: "Ташкент, главное здание школы", en: "Tashkent, main school building" },
      isRegistrationOpen: true,
      isResultsPublished: false,
    },
    {
      id: "demo-oly-junior",
      title: { uz: "Kichik olimpiada (1-4 sinf)", ru: "Малая олимпиада (1-4 классы)", en: "Junior Olympiad (grades 1-4)" },
      description: {
        uz: "Boshlang'ich sinflar uchun mantiq va matematika olimpiadasi.",
        ru: "Олимпиада по логике и математике для начальных классов.",
        en: "A logic and maths olympiad for primary grades.",
      },
      rules: null,
      subjects: [subjects[0]],
      eligibleGrades: [1, 2, 3, 4],
      eventDate: iso(now + 35 * DAY),
      registrationDeadline: iso(now + 30 * DAY),
      location: { uz: "Toshkent, maktab", ru: "Ташкент, школа", en: "Tashkent, school" },
      isRegistrationOpen: true,
      isResultsPublished: false,
    },
    {
      id: "demo-oly-past",
      title: { uz: "Qishki olimpiada", ru: "Зимняя олимпиада", en: "Winter Olympiad" },
      description: {
        uz: "O'tgan olimpiada. Natijalar e'lon qilingan.",
        ru: "Прошедшая олимпиада. Результаты опубликованы.",
        en: "A past olympiad. Results are published.",
      },
      rules: null,
      subjects: subjects.slice(0, 2),
      eligibleGrades: [7, 8, 9, 10, 11],
      eventDate: iso(now - 60 * DAY),
      registrationDeadline: iso(now - 70 * DAY),
      location: { uz: "Toshkent, maktab", ru: "Ташкент, школа", en: "Tashkent, school" },
      isRegistrationOpen: false,
      isResultsPublished: true,
    },
  ];
}

interface DemoReg extends IssuedTicket {
  status: PublicResult["status"];
  score: number | null;
  maxScore: number;
  rank: number | null;
}

const g = globalThis as unknown as { __demoOlyRegs?: Map<string, DemoReg> };

function store(): Map<string, DemoReg> {
  if (!g.__demoOlyRegs) {
    const m = new Map<string, DemoReg>();
    const y = new Date().getFullYear();
    m.set(`OLY-${y}-000001`, {
      ticket: `OLY-${y}-000001`,
      qrPayload: `OLY-${y}-000001`,
      studentName: "Demo Student",
      school: "Demo School",
      grade: 9,
      subjectKey: "math",
      olympiadId: "demo-oly-past",
      status: "attended",
      score: 92,
      maxScore: 100,
      rank: 2,
    });
    m.set(`OLY-${y}-000002`, {
      ticket: `OLY-${y}-000002`,
      qrPayload: `OLY-${y}-000002`,
      studentName: "Demo Pending",
      school: "Demo School",
      grade: 8,
      subjectKey: "math",
      olympiadId: "demo-oly-spring",
      status: "confirmed",
      score: null,
      maxScore: 100,
      rank: null,
    });
    const board: [string, string, number, number, string][] = [
      ["Karimov Bobur", "math", 98, 1, "000003"],
      ["Yusupova Malika", "math", 90, 3, "000004"],
      ["Tursunov Jasur", "math", 87, 4, "000005"],
      ["Ismoilova Zarina", "physics", 95, 1, "000006"],
      ["Rahimov Sardor", "physics", 89, 2, "000007"],
    ];
    for (const [name, subj, score, rank, no] of board) {
      const ticket = `OLY-${y}-${no}`;
      m.set(ticket, {
        ticket, qrPayload: ticket, studentName: name, school: "Demo School", grade: 9, subjectKey: subj,
        olympiadId: "demo-oly-past", status: "attended", score, maxScore: 100, rank,
      });
    }
    g.__demoOlyRegs = m;
  }
  return g.__demoOlyRegs;
}

export function demoTicketIds(): string[] {
  return [...store().keys()];
}

export type DemoRegisterError = "olympiad" | "closed" | "deadline" | "grade" | "subject";

export function demoRegister(input: RegistrationInput): { ok: true; ticket: IssuedTicket } | { ok: false; error: DemoRegisterError } {
  const oly = demoOlympiads().find((o) => o.id === input.olympiadId);
  if (!oly) return { ok: false, error: "olympiad" };
  if (!oly.isRegistrationOpen || new Date(oly.eventDate).getTime() < Date.now()) return { ok: false, error: "closed" };
  if (new Date(oly.registrationDeadline).getTime() < Date.now()) return { ok: false, error: "deadline" };
  if (!oly.eligibleGrades.includes(input.grade)) return { ok: false, error: "grade" };
  if (!oly.subjects.some((s) => s.key === input.subjectKey)) return { ok: false, error: "subject" };
  const s = store();
  let ticket = "";
  do {
    ticket = `OLY-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
  } while (s.has(ticket));
  const t: DemoReg = {
    ticket,
    qrPayload: ticket,
    studentName: input.studentFullName,
    school: input.currentSchool,
    grade: input.grade,
    subjectKey: input.subjectKey,
    olympiadId: oly.id,
    status: "pending",
    score: null,
    maxScore: 100,
    rank: null,
  };
  s.set(ticket, t);
  return { ok: true, ticket: t };
}

export function demoLeaderboardRows(olympiadId: string): LeaderRow[] {
  const oly = demoOlympiads().find((o) => o.id === olympiadId);
  if (!oly?.isResultsPublished) return [];
  return [...store().values()]
    .filter((r) => r.olympiadId === olympiadId && r.score != null && r.rank != null && r.status !== "disqualified")
    .map((r) => ({ name: r.studentName, subjectKey: r.subjectKey, score: r.score as number, maxScore: r.maxScore, rank: r.rank as number }));
}

export function demoCheck(ticket: string): PublicResult | null {
  const r = store().get(ticket);
  if (!r) return null;
  const oly = demoOlympiads().find((o) => o.id === r.olympiadId);
  if (!oly?.isResultsPublished || r.score == null) return null;
  const subj = oly.subjects.find((s) => s.key === r.subjectKey);
  return {
    name: r.studentName,
    ticket: r.ticket,
    subjectKey: r.subjectKey,
    subjectName: subj?.name ?? null,
    status: r.status,
    score: r.score,
    maxScore: r.maxScore,
    rank: r.rank,
  };
}
