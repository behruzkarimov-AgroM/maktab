"use client";

import dynamic from "next/dynamic";

/**
 * Chart-heavy portal views, code-split so recharts (~350 KB) is not part of the route's first-load JS.
 * All of them fetch their data on the client, so skipping SSR loses nothing; the skeleton keeps the layout stable.
 */
function ViewSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4 sm:p-6" aria-busy="true">
      <div className="h-8 w-56 rounded-lg bg-slate-200 dark:bg-slate-800" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-slate-200 dark:bg-slate-800" />
        ))}
      </div>
      <div className="h-72 rounded-xl bg-slate-200 dark:bg-slate-800" />
    </div>
  );
}

export const LazyAdminDashboard = dynamic(() => import("@/components/admin/Dashboard").then((m) => m.Dashboard), { ssr: false, loading: ViewSkeleton });
export const LazySurveyResults = dynamic(() => import("@/components/admin/SurveyResults").then((m) => m.SurveyResults), { ssr: false, loading: ViewSkeleton });
export const LazyTeacherClasses = dynamic(() => import("@/components/school/teacher/ClassesPage").then((m) => m.ClassesPage), { ssr: false, loading: ViewSkeleton });
export const LazyStudentProfile = dynamic(() => import("@/components/school/director/StudentProfile").then((m) => m.StudentProfile), { ssr: false, loading: ViewSkeleton });
export const LazyDirectorDashboard = dynamic(() => import("@/components/school/director/Dashboard").then((m) => m.Dashboard), { ssr: false, loading: ViewSkeleton });
export const LazyPerformance = dynamic(() => import("@/components/school/director/Performance").then((m) => m.Performance), { ssr: false, loading: ViewSkeleton });
export const LazyAttendanceOverview = dynamic(() => import("@/components/school/director/AttendanceOverview").then((m) => m.AttendanceOverview), { ssr: false, loading: ViewSkeleton });
