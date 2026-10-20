import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/school/ui/RegisterForm";
import { phoneConfig } from "@/lib/phone-auth";
import { getSchoolSession } from "@/lib/school/auth";
import { homeFor } from "@/lib/school/nav";

export const dynamic = "force-dynamic";

/** /school/register: parents create their own account with a phone confirmed through the Telegram bot */
export default async function SchoolRegisterPage() {
  const s = await getSchoolSession();
  if (s) redirect(homeFor(s.role));
  return <RegisterForm phone={phoneConfig()} />;
}
