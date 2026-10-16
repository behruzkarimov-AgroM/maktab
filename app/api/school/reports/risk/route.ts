import { api, readQuery, STAFF } from "@/lib/school/api-helpers";
import { riskQuery } from "@/lib/school/schemas";
import { listRisk } from "@/lib/school/service";

/** GET /api/school/reports/risk?class_id&limit -> { risk: RiskRow[] } students flagged low_attendance (<85%), low_average (<3) or absence_streak (>=3 days) */
export const GET = api({ roles: STAFF }, async ({ c, req }) => ({ risk: await listRisk(c, readQuery(req, riskQuery)) }));
