import { z } from "zod";
import { api, DIRECTOR, readQuery } from "@/lib/school/api-helpers";
import { dateStr } from "@/lib/school/schemas";
import * as d from "@/lib/school/svc-director";

const auditQuery = z.object({
  resource: z.string().max(60).optional(), action: z.string().max(60).optional(), q: z.string().max(80).optional(),
  from: dateStr.optional(), to: dateStr.optional(), record_id: z.string().max(80).optional(), limit: z.coerce.number().int().min(1).max(500).optional(),
});
/** GET ?resource&action&q&from&to&record_id&limit (director) -> { rows: AuditRow[] } */
export const GET = api({ roles: DIRECTOR }, async ({ c, req }) => ({ rows: await d.listAudit(c, readQuery(req, auditQuery)) }));
