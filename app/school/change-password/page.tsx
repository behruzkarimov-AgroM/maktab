import { redirect } from "next/navigation";
import { ChangePasswordScreen } from "@/components/school/ui/AuthScreens";
import { getSchoolSession } from "@/lib/school/auth";
import { homeFor } from "@/lib/school/nav";

export const dynamic = "force-dynamic";

/** Forced after a temporary password (no portal shell, so the guard cannot loop); also reachable voluntarily. */
export default async function ChangePasswordPage() {
  const s = await getSchoolSession();
  if (!s) redirect("/school/login");
  const { id, email, name, role, demo, teacherId, studentIds } = s;
  return <ChangePasswordScreen session={{ id, email, name, role, demo, teacherId, studentIds }} home={homeFor(role)} forced={!!s.mustChangePassword} />;
}
