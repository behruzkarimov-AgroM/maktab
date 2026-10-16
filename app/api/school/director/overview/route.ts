import { api, DIRECTOR } from "@/lib/school/api-helpers";
import * as d from "@/lib/school/svc-director";

/** GET /api/school/director/overview (director) -> { pending[], attendanceWeek[], termAverages[], terms[], termAverage } */
export const GET = api({ roles: DIRECTOR }, async ({ c }) => d.directorOverview(c));
