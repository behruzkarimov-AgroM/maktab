import { LazyAttendanceOverview } from "@/components/layout/LazyViews";

export default async function Page({ searchParams }: { searchParams: Promise<{ class_id?: string }> }) {
  const sp = await searchParams;
  return <LazyAttendanceOverview initialClass={sp.class_id} />;
}
