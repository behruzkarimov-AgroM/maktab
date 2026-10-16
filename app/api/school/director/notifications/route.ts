import { api, DIRECTOR } from "@/lib/school/api-helpers";
import * as d from "@/lib/school/svc-director";

/** GET (director) -> notification statistics of the whole school */
export const GET = api({ roles: DIRECTOR }, async ({ c }) => ({ stats: await d.notificationStats(c) }));
