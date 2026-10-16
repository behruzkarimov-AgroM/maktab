import { redirect } from "next/navigation";
import { LoginForm } from "@/components/school/ui/LoginForm";
import { demoLoginHints, getSchoolSession } from "@/lib/school/auth";
import { homeFor } from "@/lib/school/nav";

export const dynamic = "force-dynamic";

export default async function SchoolLoginPage() {
  const s = await getSchoolSession();
  if (s) redirect(s.mustChangePassword ? "/school/change-password" : homeFor(s.role));
  return <LoginForm demo={demoLoginHints()} />;
}
