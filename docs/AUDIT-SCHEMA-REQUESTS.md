# Schema change requests (from the backend / frontend audits)

The database owner (supabase/**, scripts/db/**, lib/supabase/**) implements every sound request and marks it
`DONE` or `REJECTED (reason)` here. Append new requests at the end in the form:

```
## R<n>: <short title>   [status: OPEN]
Requested by: <agent>  |  Table/RPC: <name>
Need: <what and why>
```

Edit supabase/schema.sql only; `npm run db:split` regenerates migrations and seed.

## Notes for API authors (from the DB audit, migration 0002)

- Deleting a class, subject or term that still has grades / attendance now fails with SQLSTATE 23503 (foreign key, ON DELETE RESTRICT)
  instead of silently wiping the history. API routes should map 23503 to HTTP 409 (`in_use`). Deleting a student still cascades.
- New integrity errors raised by triggers (SQLSTATE 23514): `term_not_in_year`, `date_out_of_term`, `term_outside_year`,
  `invalid_options`, `correct_option_missing`, `invalid_option_score`. `audit_log` rows can no longer be UPDATEd (`audit_log_immutable`).
- `purge_old_data(p_visit_days, p_audit_days, p_notification_days, p_attempt_days, p_batch)` now also trims notifications (180 d) and
  quiz/psych attempts (730 d), at most `p_batch` rows per table per call.
- `anon` can no longer EXECUTE `has_role()` / `is_admin()`; `authenticated` can only UPDATE `notifications.read_at`.
- Storage buckets accept only jpeg/png/gif/webp/pdf (the types /api/admin/upload already sniffs).


## Requests from the backend/security pass

| id | table / function | change | reason |
|----|------------------|--------|--------|
| B-1 | `public.register_olympiad(...)` | `revoke execute ... from anon, authenticated; grant execute ... to service_role;` | `/api/olympiad/register` now calls it with the service client only (rate limit, honeypot, origin check run first). Direct PostgREST calls with the anon key bypass them. |
| B-2 | `public.submit_quiz_attempt(...)` | `revoke execute ... from anon, authenticated; grant execute ... to service_role;` | `/api/quiz/[id]/submit` uses the service client (start-token timing, CSRF, rate limit). |
| B-3 | `public.submit_psych_test(...)` | `revoke execute ... from anon, authenticated; grant execute ... to service_role;` | `/api/psych/submit` uses the service client. |
| B-4 | (all three) | keep the SECURITY DEFINER bodies unchanged | Routes answer 503 `unavailable` when SUPABASE_SERVICE_ROLE_KEY is missing, like surveys submit. APPLY THE REVOKES TOGETHER WITH THIS CODE: until then both paths work, afterwards only the server path does. |

Notes: foreign-key violations (23503) and unique violations (23505) now map to HTTP 409 (`conflict` / school `reference_conflict`). `/api/admin/upload` sniffs magic bytes itself and never relies on the bucket MIME list.