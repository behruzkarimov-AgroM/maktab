import { ReportsHub } from "@/components/school/director/ReportsHub";

export default async function Page({ searchParams }: { searchParams: Promise<{ student_id?: string }> }) {
  const sp = await searchParams;
  return <ReportsHub initialStudent={sp.student_id} />;
}
