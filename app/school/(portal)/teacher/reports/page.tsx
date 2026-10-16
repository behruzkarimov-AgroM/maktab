import { Suspense } from "react";
import { ReportsPage } from "@/components/school/teacher/ReportsPage";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReportsPage />
    </Suspense>
  );
}
