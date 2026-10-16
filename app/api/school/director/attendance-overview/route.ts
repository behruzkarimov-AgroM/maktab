import { z } from "zod";
import { api, DIRECTOR, readQuery } from "@/lib/school/api-helpers";
import { dateStr } from "@/lib/school/schemas";
import * as d from "@/lib/school/svc-director";

/** GET ?from&to (director) -> per class counts, per day percent, absence reasons */
export const GET = api({ roles: DIRECTOR }, async ({ c, req }) => {
  const q = readQuery(req, z.object({ from: dateStr, to: dateStr }));
  return d.attendanceOverview(c, q.from, q.to);
});
