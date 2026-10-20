// Browser-side fetch helpers for /api/school/**. Throws ApiError with the stable server error code.
// Usage: const { students } = await sget<{ students: StudentListItem[] }>("/students?class_id=...");
export class ApiError extends Error {
  constructor(readonly code: string, readonly status: number, readonly fields?: string[]) {
    super(code);
    this.name = "ApiError";
  }
}

/** Temporary-password accounts get 403 `password_change_required` from every endpoint but /me, change-password and logout. */
function onPasswordChangeRequired(): void {
  if (typeof window === "undefined") return;
  const here = window.location.pathname;
  if (here === "/school/change-password" || here.startsWith("/school/reset-password")) return;
  // full page load on purpose: called outside React (no router), and the portal must not keep state of the locked session
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/school/change-password";
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/school${path}`, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as ({ ok: boolean; error?: string; fields?: string[] } & Record<string, unknown>) | null;
  if (!res.ok || !json || json.ok === false) {
    if (res.status === 403 && json?.error === "password_change_required") onPasswordChangeRequired();
    throw new ApiError(json?.error ?? "server_error", res.status, json?.fields);
  }
  return json as T;
}

export const sget = <T,>(path: string) => call<T>("GET", path);
export const spost = <T,>(path: string, body?: unknown) => call<T>("POST", path, body ?? {});
export const sput = <T,>(path: string, body: unknown) => call<T>("PUT", path, body);
export const spatch = <T,>(path: string, body: unknown) => call<T>("PATCH", path, body);
export const sdelete = <T,>(path: string, body?: unknown) => call<T>("DELETE", path, body);

/** multipart upload (student import preview) */
export async function supload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`/api/school${path}`, { method: "POST", credentials: "same-origin", body: form });
  const json = (await res.json().catch(() => null)) as ({ ok: boolean; error?: string } & Record<string, unknown>) | null;
  if (!res.ok || !json || json.ok === false) {
    if (res.status === 403 && json?.error === "password_change_required") onPasswordChangeRequired();
    throw new ApiError(json?.error ?? "server_error", res.status);
  }
  return json as T;
}

export const qs = (params: Record<string, string | number | boolean | null | undefined>): string => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
};
