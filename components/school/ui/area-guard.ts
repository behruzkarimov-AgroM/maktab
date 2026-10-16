import { redirect } from "next/navigation";
import { getSchoolSession } from "@/lib/school/auth";
import { homeFor } from "@/lib/school/nav";
import { areaOf, type PortalArea } from "@/lib/school/types";

/** Call from an area layout: sends users of another role to their own area. */
export async function requireArea(area: PortalArea): Promise<void> {
  const s = await getSchoolSession();
  if (!s) redirect("/school/login");
  if (areaOf(s.role) !== area) redirect(homeFor(s.role));
}
