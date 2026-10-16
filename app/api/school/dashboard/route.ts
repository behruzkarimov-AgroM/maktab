import { api } from "@/lib/school/api-helpers";
import { dashboard } from "@/lib/school/service";

/** GET /api/school/dashboard -> { dashboard: DashboardData } (role-aware) */
export const GET = api({}, async ({ c }) => ({ dashboard: await dashboard(c) }));
