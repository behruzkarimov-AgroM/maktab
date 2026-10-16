import type { ReactNode } from "react";
import { requireArea } from "@/components/school/ui/area-guard";

// Phase 2 agent B owns app/school/(portal)/teacher/**. Keep the role guard.
export default async function TeacherLayout({ children }: { children: ReactNode }) {
  await requireArea("teacher");
  return <>{children}</>;
}
