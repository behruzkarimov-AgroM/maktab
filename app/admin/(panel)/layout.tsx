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
  if (!session) redirect((await hasNonAdminUser()) ? "/admin/login?error=forbidden" : "/admin/login");
  return (
    <AdminProvider session={session}>
      <AdminShell session={session}>{children}</AdminShell>
    </AdminProvider>
  );
}
