/** Extracts an olympiad ticket (legacy OLY-YYYY-NNNNNN or OLY-YYYY-XXXXXXXXXX hex) from raw/URL/JSON scanner input. */
export function extractTicket(raw: unknown): string | null {
  const m = String(raw ?? "").toUpperCase().match(/OLY-\d{4}-(?:\d{6}|[0-9A-F]{10})(?![0-9A-Z])/i);
  return m ? m[0] : null;
}
