// Stable error codes for the SIS API. The HTTP body is always { ok:false, error: <code> } (never a raw message).
export const ERROR_STATUS: Record<string, number> = {
  bad_json: 400,
  invalid_input: 422,
  validation: 422,
  invalid_status: 422,
  invalid_score: 422,
  invalid_kind: 422,
  invalid_date: 422,
  date_out_of_term: 422,
  term_not_in_year: 422,
  student_not_in_class: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  unsupported: 415,
  conflict: 409,
  duplicate: 409,
  /** foreign-key violation (23503) */
  reference_conflict: 409,
  term_locked: 409,
  /** schedule: the room is already used by another class at that weekday + lesson */
  room_busy: 409,
  /** the account still has a temporary password: only /me, /auth/change-password and /auth/logout are allowed */
  password_change_required: 403,
  weak_password: 422,
  /** notification channel that cannot be switched on (e-mail) */
  channel_unavailable: 422,
  wrong_password: 403,
  invalid_token: 422,
  already_resolved: 409,
  edit_window_closed: 409,
  rate_limited: 429,
  payload_too_large: 413,
  not_configured: 501,
  db_error: 500,
  server_error: 500,
};

export class SchoolError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status?: number, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "SchoolError";
    this.code = code;
    this.status = status ?? ERROR_STATUS[code] ?? 400;
  }
}

/** error codes raised by SQL RPCs (exception message == code) that are safe to expose */
export const RPC_CODES = new Set([
  "forbidden", "invalid_input", "invalid_status", "invalid_score", "invalid_kind", "invalid_date", "date_out_of_term", "term_not_in_year",
  "student_not_in_class", "not_found", "term_locked", "edit_window_closed",
]);

export const isSchoolError = (e: unknown): e is SchoolError => e instanceof Error && (e as { name?: string }).name === "SchoolError";
