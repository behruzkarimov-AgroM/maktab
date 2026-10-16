"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { sget, qs } from "@/lib/school/client";
import type {
  AttendanceRecord, GradeEntry, Lesson, ScheduleSlot, SchoolYear, StudentListItem, StudentPerformance, Subject, Term,
} from "@/lib/school/types";
import { cn } from "@/components/school/ui/kit";
import { useSchool } from "@/components/school/ui/SchoolProvider";
import { useAsync, useErrorText, useLocalValue } from "./hooks";
import { addDaysIso, type DayRow } from "./logic";
import { ErrorBox, PageSkeleton } from "./widgets";

export interface FamilyInfo {
  class_name: string | null;
  room: string | null;
  homeroom_teacher: string | null;
  subjects: { subject_id: string; teacher: string | null }[];
}
export interface Excuse {
  date: string; reason: string; note: string; created_at: string;
  /** true once the teacher accepted (GET /family/excuse); `status:"rejected"` is rendered when the backend starts sending it */
  resolved?: boolean; resolved_at?: string | null; resolved_by?: string | null; status?: "accepted" | "rejected" | "pending";
}
export interface Bundle {
  perf: StudentPerformance;
  att: { rows: AttendanceRecord[]; days: DayRow[]; summary: { streak: number } };
  grades: GradeEntry[];
  slots: ScheduleSlot[];
  lessons: Lesson[];
  info: FamilyInfo;
  excuses: Excuse[];
  /** class average per subject for the current term (privacy-safe aggregate); null = hidden (fewer than 5 pupils with grades) */
  classAvg: { loaded: boolean; minStudents: number; bySubject: Record<string, number | null> };
}
interface MeData {
  today: string;
  year: SchoolYear | null;
  term: Term | null;
  terms: Term[];
}

interface Ctx {
  me: MeData;
  children: StudentListItem[];
  childId: string;
  child: StudentListItem;
  setChildId: (id: string) => void;
  subjects: Subject[];
  isStudent: boolean;
  bundle: Bundle | null;
  bundleLoading: boolean;
  bundleError: unknown;
  reloadBundle: () => void;
}
const FamilyCtx = createContext<Ctx | null>(null);
export function useFamily(): Ctx {
  const v = useContext(FamilyCtx);
  if (!v) throw new Error("useFamily must be used inside <FamilyProvider>");
  return v;
}

export const childName = (s: Pick<StudentListItem, "first_name" | "last_name">) => `${s.first_name} ${s.last_name}`;

async function loadBase() {
  const [me, st, sj] = await Promise.all([
    sget<MeData>("/me"),
    sget<{ students: StudentListItem[] }>("/students?with_stats=1"),
    sget<{ subjects: Subject[] }>("/subjects"),
  ]);
  return { me, children: st.students, subjects: sj.subjects };
}

async function loadBundle(child: StudentListItem, today: string, isParent: boolean, termId: string | null): Promise<Bundle> {
  const sid = child.id;
  const cid = child.class_id;
  const [perf, att, grades, sched, les, info, exc, avg] = await Promise.all([
    sget<{ performance: StudentPerformance }>(`/reports/student-performance${qs({ student_id: sid })}`),
    sget<{ history: { rows: AttendanceRecord[]; days: DayRow[]; summary: { streak: number } } }>(`/attendance${qs({ student_id: sid })}`),
    sget<{ grades: GradeEntry[] }>(`/grades${qs({ student_id: sid })}`),
    cid ? sget<{ slots: ScheduleSlot[] }>(`/schedule${qs({ class_id: cid })}`) : Promise.resolve({ slots: [] as ScheduleSlot[] }),
    cid ? sget<{ lessons: Lesson[] }>(`/lessons${qs({ class_id: cid, from: addDaysIso(today, -14), to: today })}`) : Promise.resolve({ lessons: [] as Lesson[] }),
    sget<{ info: FamilyInfo }>(`/family/info${qs({ student_id: sid })}`),
    isParent ? sget<{ excuses: Excuse[] }>(`/family/excuse${qs({ student_id: sid })}`) : Promise.resolve({ excuses: [] as Excuse[] }),
    sget<{ min_students: number; subjects: { subject_id: string; average: number | null }[] }>(`/family/class-average${qs({ student: sid, term: termId })}`).catch(() => null),
  ]);
  return {
    perf: perf.performance, att: att.history, grades: [...grades.grades].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    slots: sched.slots, lessons: les.lessons, info: info.info, excuses: exc.excuses,
    classAvg: {
      loaded: !!avg, minStudents: avg?.min_students ?? 5,
      bySubject: Object.fromEntries((avg?.subjects ?? []).map((x) => [x.subject_id, x.average])),
    },
  };
}

/** Loads the signed-in family account once (me, children, subjects), keeps the selected child and lazily loads its data bundle. */
export function FamilyProvider({ children: page }: { children: ReactNode }) {
  const { session, t } = useSchool();
  const errText = useErrorText();
  const base = useAsync("base", loadBase);
  const [stored, setStored] = useLocalValue("school-family-child");
  const list = base.data?.children ?? [];
  const child = list.find((c) => c.id === stored) ?? list[0] ?? null;
  const isParent = session?.role === "parent";
  const today = base.data?.me.today ?? "";
  const bundleRes = useAsync(child ? `b:${child.id}` : null, () => loadBundle(child as StudentListItem, today, isParent, base.data?.me.term?.id ?? null));
  const { reload } = bundleRes;
  const reloadBundle = useCallback(() => reload(), [reload]);

  const value = useMemo<Ctx | null>(
    () =>
      base.data && child
        ? {
            me: base.data.me, children: list, childId: child.id, child, setChildId: setStored, subjects: base.data.subjects,
            isStudent: session?.role === "student", bundle: bundleRes.data, bundleLoading: bundleRes.loading, bundleError: bundleRes.error, reloadBundle,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base.data, child?.id, bundleRes.data, bundleRes.loading, bundleRes.error, session?.role, setStored, reloadBundle],
  );

  if (base.loading) return <PageSkeleton />;
  if (base.error) return <ErrorBox message={errText(base.error)} onRetry={base.reload} />;
  if (!value) return <ErrorBox message={t("f_noChildren")} />;
  return (
    <FamilyCtx.Provider value={value}>
      <ChildSwitcher />
      {page}
    </FamilyCtx.Provider>
  );
}

/** chips shown only when the account has more than one child */
function ChildSwitcher() {
  const { children, childId, setChildId } = useFamily();
  const { t } = useSchool();
  if (children.length < 2) return null;
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="group" aria-label={t("f_switchChild")}>
      {children.map((c) => (
        <button
          key={c.id}
          onClick={() => setChildId(c.id)}
          aria-pressed={c.id === childId}
          className={cn(
            "flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50",
            c.id === childId
              ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
          )}
        >
          <span className="grid size-6 place-items-center rounded-full bg-fuchsia-400 text-xs font-bold text-slate-900">{c.first_name.slice(0, 1)}</span>
          {c.first_name}
          <span className={cn("rounded-full px-1.5 text-xs", c.id === childId ? "bg-black/25" : "bg-slate-100 dark:bg-slate-800")}>{c.class_name ?? "-"}</span>
        </button>
      ))}
    </div>
  );
}

/** renders its children once the selected child's bundle is loaded (skeleton / error / retry otherwise) */
export function BundleGate({ children }: { children: (b: Bundle) => ReactNode }) {
  const f = useFamily();
  const errText = useErrorText();
  if (f.bundleLoading) return <PageSkeleton />;
  if (f.bundleError || !f.bundle) return <ErrorBox message={errText(f.bundleError)} onRetry={f.reloadBundle} />;
  return <>{children(f.bundle)}</>;
}
