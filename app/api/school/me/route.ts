import { api } from "@/lib/school/api-helpers";
import { homeFor } from "@/lib/school/nav";
import { currentTerm } from "@/lib/school/service";

/**
 * GET /api/school/me -> { user, home, demo, today, year, term, terms, rules, must_change_password }
 * `must_change_password: true` = the account still has the temporary password issued by the director: the UI must send the user to the
 * change-password screen; every other endpoint answers 403 `password_change_required` until POST /auth/change-password succeeded.
 */
export const GET = api({ allowMustChange: true }, async ({ c, s }) => ({
  user: { id: s.id, email: s.email, name: s.name, role: s.role, teacherId: s.teacherId, studentIds: s.studentIds },
  home: homeFor(s.role),
  demo: s.demo,
  must_change_password: !!s.mustChangePassword,
  today: c.today,
  year: c.year,
  term: currentTerm(c),
  terms: c.terms,
  rules: c.rules,
}));
