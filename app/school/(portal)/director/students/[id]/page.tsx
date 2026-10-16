import { LazyStudentProfile } from "@/components/layout/LazyViews";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LazyStudentProfile id={id} />;
}
