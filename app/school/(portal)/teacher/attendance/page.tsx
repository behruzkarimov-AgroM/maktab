import { Suspense } from "react";
import { AttendancePage } from "@/components/school/teacher/AttendancePage";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <AttendancePage />
    </Suspense>
  );
}
