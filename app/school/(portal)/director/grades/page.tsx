import { LazyPerformance } from "@/components/layout/LazyViews";

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  return <LazyPerformance initialTab={sp.tab} />;
}
