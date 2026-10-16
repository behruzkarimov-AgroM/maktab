// Shared UI strings of the school portal (UZ default, RU, EN). Client-safe.
// Phase 2 agents: add feature specific strings next to the feature (e.g. components/school/director/i18n.ts) with the same shape.
import type { Locale } from "@/lib/types";
import { FAMILY_UI } from "./i18n-family";
import { DIRECTOR_UI } from "./i18n-director";
import { TEACHER_UI } from "./i18n-teacher";
import { ACCOUNT_UI } from "./i18n-account";

export type T3 = Record<Locale, string>;
const l = (uz: string, ru: string, en: string): T3 => ({ uz, ru, en });

export const SCHOOL_LANG_KEY = "school-lang";

const BASE = {
  appName: l("Maktab tizimi", "Школьная система", "School system"),
  schoolName: l("Children's Academy Group Termez", "Children's Academy Group Termez", "Children's Academy Group Termez"),
  // auth
  signIn: l("Kirish", "Войти", "Sign in"),
  signOut: l("Chiqish", "Выйти", "Sign out"),
  email: l("E-pochta", "E-mail", "Email"),
  password: l("Parol", "Пароль", "Password"),
  loginTitle: l("Maktab tizimiga kirish", "Вход в школьную систему", "School system sign-in"),
  loginFailed: l("Kirish muvaffaqiyatsiz: login yoki parol noto'g'ri", "Не удалось войти: неверный логин или пароль", "Sign-in failed: wrong email or password"),
  loginLimited: l("Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring.", "Слишком много попыток. Попробуйте позже.", "Too many attempts. Try again later."),
  loginUnavailable: l("Tizim sozlanmagan", "Система не настроена", "The system is not configured"),
  demoLogin: l("Demo kirish", "Демо-вход", "Demo login"),
  demoHint: l("Demo hisoblar (parol: demo1234)", "Демо-аккаунты (пароль: demo1234)", "Demo accounts (password: demo1234)"),
  demoBanner: l("DEMO REJIM: ma'lumotlar xotirada saqlanadi va server qayta ishga tushganda tiklanadi.", "ДЕМО-РЕЖИМ: данные хранятся в памяти и сбрасываются при перезапуске сервера.", "DEMO MODE: data lives in server memory and resets on restart."),
  // roles
  roleDirector: l("Direktor", "Директор", "Director"),
  roleTeacher: l("O'qituvchi", "Учитель", "Teacher"),
  roleParent: l("Ota-ona", "Родитель", "Parent"),
  roleStudent: l("O'quvchi", "Ученик", "Student"),
  // nav
  navDashboard: l("Bosh sahifa", "Главная", "Dashboard"),
  navStudents: l("O'quvchilar", "Ученики", "Students"),
  navTeachers: l("O'qituvchilar", "Учителя", "Teachers"),
  navClasses: l("Sinflar", "Классы", "Classes"),
  navMyClasses: l("Mening sinflarim", "Мои классы", "My classes"),
  navSubjects: l("Fanlar", "Предметы", "Subjects"),
  navSchedule: l("Dars jadvali", "Расписание", "Schedule"),
  navAttendance: l("Davomat", "Посещаемость", "Attendance"),
  navGrades: l("O'zlashtirish", "Успеваемость", "Grades"),
  navJournal: l("Jurnal", "Журнал", "Journal"),
  navReports: l("Hisobotlar", "Отчёты", "Reports"),
  navAnnouncements: l("E'lonlar", "Объявления", "Announcements"),
  navImport: l("Import", "Импорт", "Import"),
  navSettings: l("Sozlamalar", "Настройки", "Settings"),
  navChildren: l("Farzandlarim", "Мои дети", "My children"),
  navNotifications: l("Bildirishnomalar", "Уведомления", "Notifications"),
  // placeholder
  comingSoon: l("Tez orada (2-bosqich)", "Скоро (этап 2)", "Coming in phase 2"),
  comingSoonText: l("Bu bo'lim keyingi bosqichda qo'shiladi. Server API tayyor.", "Этот раздел появится на следующем этапе. API на сервере готов.", "This section is built in phase 2. The server API is ready."),
  // common
  save: l("Saqlash", "Сохранить", "Save"),
  cancel: l("Bekor qilish", "Отмена", "Cancel"),
  close: l("Yopish", "Закрыть", "Close"),
  edit: l("Tahrirlash", "Редактировать", "Edit"),
  delete: l("O'chirish", "Удалить", "Delete"),
  add: l("Qo'shish", "Добавить", "Add"),
  search: l("Qidirish…", "Поиск…", "Search…"),
  loading: l("Yuklanmoqda…", "Загрузка…", "Loading…"),
  noData: l("Ma'lumot topilmadi", "Данных нет", "No data found"),
  retry: l("Qayta urinish", "Повторить", "Retry"),
  errorGeneric: l("Xatolik yuz berdi", "Произошла ошибка", "Something went wrong"),
  forbidden: l("Ruxsat yo'q", "Нет доступа", "Not allowed"),
  yes: l("Ha", "Да", "Yes"),
  no: l("Yo'q", "Нет", "No"),
  today: l("Bugun", "Сегодня", "Today"),
  class: l("Sinf", "Класс", "Class"),
  subject: l("Fan", "Предмет", "Subject"),
  term: l("Chorak", "Четверть", "Term"),
  date: l("Sana", "Дата", "Date"),
  average: l("O'rtacha", "Средний балл", "Average"),
  theme: l("Mavzu", "Тема", "Theme"),
  language: l("Til", "Язык", "Language"),
  // attendance statuses
  stPresent: l("Keldi", "Присутствует", "Present"),
  stAbsent: l("Kelmadi", "Отсутствует", "Absent"),
  stLate: l("Kechikdi", "Опоздал", "Late"),
  stExcused: l("Sababli", "Уважительная", "Excused"),
  stSick: l("Kasal", "Болеет", "Sick"),
  // risk
  riskLowAttendance: l("Davomat past", "Низкая посещаемость", "Low attendance"),
  riskLowAverage: l("O'rtacha past", "Низкий балл", "Low average"),
  riskAbsenceStreak: l("Ketma-ket qoldirish", "Пропуски подряд", "Absence streak"),
  // parent & student cabinet (lib/school/i18n-family.ts)
  ...FAMILY_UI,
} as const;

/** shared strings + the director (`d_`), teacher (`t_`) and account/security (`a_`) dictionaries */
export const UI = { ...BASE, ...DIRECTOR_UI, ...TEACHER_UI, ...ACCOUNT_UI } as const;

/** shared message for an API error code (account, security, excuse and schedule codes); null = not covered here */
export function accountErrorKey(code: string): UiKey | null {
  const k = `a_err_${code}`;
  return k in UI ? (k as UiKey) : null;
}

export type UiKey = keyof typeof UI;
export const ATTENDANCE_LABEL = { present: "stPresent", absent: "stAbsent", late: "stLate", excused: "stExcused", sick: "stSick" } as const satisfies Record<string, UiKey>;
export const RISK_LABEL = { low_attendance: "riskLowAttendance", low_average: "riskLowAverage", absence_streak: "riskAbsenceStreak" } as const satisfies Record<string, UiKey>;
export const ROLE_LABEL = { super_admin: "roleDirector", school_admin: "roleDirector", teacher: "roleTeacher", parent: "roleParent", student: "roleStudent" } as const satisfies Record<string, UiKey>;
