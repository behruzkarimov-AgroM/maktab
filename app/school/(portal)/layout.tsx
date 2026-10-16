import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { PortalShell } from "@/components/school/ui/PortalShell";
import { SchoolProvider } from "@/components/school/ui/SchoolProvider";
import { getSchoolSession } from "@/lib/school/auth";

// The guard reads cookies/session; never prerender.
export const dynamic = "force-dynamic";

/** Server-side guard: every page under /school/(portal) requires an active school account. */
async function Guard({ children }: { children: ReactNode }) {
  const s = await getSchoolSession();
  if (!s) redirect("/school/login");
  if (s.mustChangePassword) redirect("/school/change-password");
  const { id, email, name, role, demo, teacherId, studentIds } = s;
  return (
    <SchoolProvider session={{ id, email, name, role, demo, teacherId, studentIds }}>
      <PortalShell>{children}</PortalShell>
    </SchoolProvider>
  );
}

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
          <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      }
    >
      <Guard>{children}</Guard>
    </Suspense>
  );
}
