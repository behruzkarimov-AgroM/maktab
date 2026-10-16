import type { ReactNode } from "react";
import { requireArea } from "@/components/school/ui/area-guard";

// Phase 2 agent A owns app/school/(portal)/director/**. Keep the role guard.
export default async function DirectorLayout({ children }: { children: ReactNode }) {
  await requireArea("director");
  return <>{children}</>;
}
