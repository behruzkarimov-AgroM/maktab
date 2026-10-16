import { api, readQuery } from "@/lib/school/api-helpers";
import { performanceQuery } from "@/lib/school/schemas";
import { studentPerformance } from "@/lib/school/service";

/** GET /api/school/reports/student-performance?student_id -> { performance: StudentPerformance } trend per term, subject averages, GPA, rank, attendance, risk flags */
export const GET = api({}, async ({ c, req }) => ({ performance: await studentPerformance(c, readQuery(req, performanceQuery).student_id) }));
