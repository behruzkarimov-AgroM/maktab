import { notFound } from "next/navigation";
import { EnrollForm } from "@/components/admin/EnrollForm";
import { getSession } from "@/lib/admin/auth";

/** Super admin only (the API checks the role again on every request). */
export default async function EnrollPage() {
  const session = await getSession();
  if (session?.role !== "super_admin") notFound();
  return <EnrollForm />;
}
