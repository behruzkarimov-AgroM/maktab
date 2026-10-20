import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminProvider } from "@/components/admin/AdminProvider";
import { AdminShell } from "@/components/admin/AdminShell";
import { getSession, hasNonAdminUser } from "@/lib/admin/auth";

// The guard reads cookies/session; never prerender (otherwise the login redirect gets baked in at build time).
export const dynamic = "force-dynamic";

/**
 * Server-side guard: every page under /admin (except /admin/login) requires an active admin profile.
 * Deliberately NOT wrapped in <Suspense>: the session is resolved before any byte is streamed, so an anonymous request gets a real
 * 307 redirect instead of a 200 response carrying the panel shell and a streamed client-side redirect.
 */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  // signed in, but not an admin (student, parent, teacher, director): their own portal instead of an error; /school then
  // routes by role (or back to the login when the account is inactive)
  if (!session) redirect((await hasNonAdminUser()) ? "/school" : "/admin/login");
  return (
    <AdminProvider session={session}>
      <AdminShell session={session}>{children}</AdminShell>
    </AdminProvider>
  );
}
