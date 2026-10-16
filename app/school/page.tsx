import { redirect } from "next/navigation";
import { getSchoolSession } from "@/lib/school/auth";
import { homeFor } from "@/lib/school/nav";

export const dynamic = "force-dynamic";

/** /school -> role home (/school/director | /school/teacher | /school/family) or the login page */
export default async function SchoolIndex() {
  const s = await getSchoolSession();
  redirect(s ? homeFor(s.role) : "/school/login");
}
