import { Suspense } from "react";
import { DashboardPage } from "@/components/school/teacher/DashboardPage";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DashboardPage />
    </Suspense>
  );
}
