import type { ReactNode } from "react";
import { requireArea } from "@/components/school/ui/area-guard";
import { FamilyProvider } from "@/components/school/family/FamilyProvider";

// Agent C owns app/school/(portal)/family/** (parents and students). Keep the role guard.
export default async function FamilyLayout({ children }: { children: ReactNode }) {
  await requireArea("family");
  return (
    <div className="mx-auto w-full max-w-5xl">
      <FamilyProvider>{children}</FamilyProvider>
    </div>
  );
}
