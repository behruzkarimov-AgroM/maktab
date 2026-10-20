import { redirect } from "next/navigation";
import { LoginForm } from "@/components/school/ui/LoginForm";
import { phoneConfig } from "@/lib/phone-auth";
import { demoLoginHints, getSchoolSession } from "@/lib/school/auth";
import { homeFor } from "@/lib/school/nav";

export const dynamic = "force-dynamic";

export default async function SchoolLoginPage({ searchParams }: { searchParams: Promise<{ via?: string }> }) {
  const s = await getSchoolSession();
  if (s) redirect(s.mustChangePassword ? "/school/change-password" : homeFor(s.role));
  const via = (await searchParams).via === "phone" ? "phone" : "password";
  return <LoginForm demo={demoLoginHints()} phone={phoneConfig()} initialTab={via} />;
}
