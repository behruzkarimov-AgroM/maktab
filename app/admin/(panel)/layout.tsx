import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminProvider } from "@/components/admin/AdminProvider";
import { AdminShell } from "@/components/admin/AdminShell";
import { getSession, hasNonAdminUser } from "@/lib/admin/auth";

// The guard reads cookies/session; never prerender (otherwise the login redirect gets baked in at build time).
export const dynamic = "force-dynamic";

/** Server-side guard: every page under /admin (except /admin/login) requires an active admin profile. */
async function Guard({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect((await hasNonAdminUser()) ? "/admin/login?error=forbidden" : "/admin/login");
  return (
    <AdminProvider session={session}>
      <AdminShell session={session}>{children}</AdminShell>
    </AdminProvider>
  );
}

export default function PanelLayout({ children }: { children: ReactNode }) {
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
