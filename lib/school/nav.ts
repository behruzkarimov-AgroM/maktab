// Role -> sidebar navigation for the portal shell. Phase 2 agents replace the placeholder pages behind these hrefs.
// Client-safe. `label` keys live in lib/school/i18n.ts.
import { areaOf, type PortalArea, type SchoolRole } from "./types";

export interface NavItem {
  key: string;
  /** i18n key (lib/school/i18n.ts) */
  label: string;
  href: string;
  icon: "dashboard" | "users" | "class" | "book" | "calendar" | "check" | "chart" | "megaphone" | "settings" | "upload" | "file" | "bell" | "child" | "teacher";
}

const D = "/school/director";
const T = "/school/teacher";
const F = "/school/family";

export const NAV: Record<PortalArea, NavItem[]> = {
  director: [
    { key: "dashboard", label: "navDashboard", href: D, icon: "dashboard" },
    { key: "students", label: "navStudents", href: `${D}/students`, icon: "users" },
    { key: "teachers", label: "navTeachers", href: `${D}/teachers`, icon: "teacher" },
    { key: "classes", label: "navClasses", href: `${D}/classes`, icon: "class" },
    { key: "subjects", label: "navSubjects", href: `${D}/subjects`, icon: "book" },
    { key: "schedule", label: "navSchedule", href: `${D}/schedule`, icon: "calendar" },
    { key: "calendar", label: "d_calendar", href: `${D}/calendar`, icon: "calendar" },
    { key: "attendance", label: "navAttendance", href: `${D}/attendance`, icon: "check" },
    { key: "grades", label: "navGrades", href: `${D}/grades`, icon: "chart" },
    { key: "reports", label: "navReports", href: `${D}/reports`, icon: "file" },
    { key: "announcements", label: "navAnnouncements", href: `${D}/announcements`, icon: "megaphone" },
    { key: "import", label: "navImport", href: `${D}/import`, icon: "upload" },
    { key: "audit", label: "d_audit_log", href: `${D}/audit`, icon: "bell" },
    { key: "settings", label: "navSettings", href: `${D}/settings`, icon: "settings" },
  ],
  teacher: [
    { key: "dashboard", label: "navDashboard", href: T, icon: "dashboard" },
    { key: "attendance", label: "navAttendance", href: `${T}/attendance`, icon: "check" },
    { key: "journal", label: "navJournal", href: `${T}/journal`, icon: "book" },
    { key: "classes", label: "navMyClasses", href: `${T}/classes`, icon: "class" },
    { key: "schedule", label: "navSchedule", href: `${T}/schedule`, icon: "calendar" },
    { key: "reports", label: "navReports", href: `${T}/reports`, icon: "file" },
    { key: "announcements", label: "navAnnouncements", href: `${T}/announcements`, icon: "megaphone" },
    { key: "account", label: "a_account", href: `${T}/account`, icon: "settings" },
  ],
  family: [
    { key: "dashboard", label: "navDashboard", href: F, icon: "dashboard" },
    { key: "children", label: "navChildren", href: `${F}/children`, icon: "child" },
    { key: "attendance", label: "navAttendance", href: `${F}/attendance`, icon: "check" },
    { key: "grades", label: "navGrades", href: `${F}/grades`, icon: "chart" },
    { key: "schedule", label: "navSchedule", href: `${F}/schedule`, icon: "calendar" },
    { key: "announcements", label: "navAnnouncements", href: `${F}/announcements`, icon: "megaphone" },
    { key: "notifications", label: "navNotifications", href: `${F}/notifications`, icon: "bell" },
    { key: "report-card", label: "f_reportCard", href: `${F}/report-card`, icon: "file" },
    { key: "progress", label: "f_progress", href: `${F}/progress`, icon: "chart" },
    { key: "profile", label: "f_profile", href: `${F}/profile`, icon: "settings" },
  ],
};

export const homeFor = (role: SchoolRole): string => ({ director: D, teacher: T, family: F })[areaOf(role)];
/** students do not get the "my children" page (their own profile is under "profile") */
export const navFor = (role: SchoolRole): NavItem[] => NAV[areaOf(role)].filter((i) => !(role === "student" && i.key === "children"));
/** the path prefix a role may open under /school (used by the portal guard) */
export const areaPrefix = (role: SchoolRole): string => homeFor(role);
