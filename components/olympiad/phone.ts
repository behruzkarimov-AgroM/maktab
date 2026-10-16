/** Uzbek phone mask helpers. Kept free of zod so the public landing page does not ship a validation library. */

/** "+998 90 123 45 67" mask. Returns display string. */
export function maskPhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  // strip the country code only when it is really one: "+998…" or a >9-digit number starting with 998
  // (a bare 9-digit national number such as 998123456 must keep its digits)
  if (d.startsWith("998") && (raw.trim().startsWith("+") || d.length > 9)) d = d.slice(3);
  d = d.slice(0, 9);
  let out = "+998";
  if (d.length) out += " " + d.slice(0, 2);
  if (d.length > 2) out += " " + d.slice(2, 5);
  if (d.length > 5) out += " " + d.slice(5, 7);
  if (d.length > 7) out += " " + d.slice(7, 9);
  return out;
}

/** Display mask -> "+998901234567" (or "" when nothing typed). */
export function phoneValue(masked: string): string {
  const d = masked.replace(/\D/g, "").replace(/^998/, "");
  return d ? "+998" + d : "";
}
