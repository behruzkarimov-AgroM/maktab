// Browser-side helpers for the admin REST API.
import type { ListResult, Row } from "./types";

export class ApiError extends Error {
  constructor(message: string, public status: number, public issues?: { path: string; message: string }[]) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    // expired session -> login page; but never for the login call itself (keep its error message). A full page load on purpose:
    // this helper runs outside React (no router) and every piece of client state of the old session must be dropped.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (r.status === 401 && typeof window !== "undefined" && !url.includes("/auth/login")) window.location.assign("/admin/login");
    throw new ApiError((body as { error?: string }).error ?? r.statusText, r.status, (body as { issues?: { path: string; message: string }[] }).issues);
  }
  return body as T;
}

export interface Query {
  q?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  all?: boolean;
  filters?: Record<string, string | undefined>;
}

export function qs(q: Query): string {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.sort) p.set("sort", q.sort);
  if (q.dir) p.set("dir", q.dir);
  if (q.page) p.set("page", String(q.page));
  if (q.pageSize) p.set("pageSize", String(q.pageSize));
  if (q.all) p.set("all", "1");
  for (const [k, v] of Object.entries(q.filters ?? {})) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const api = {
  list: (resource: string, q: Query = {}) => call<ListResult>(`/api/admin/${resource}${qs(q)}`),
  get: (resource: string, id: string | number) => call<Row>(`/api/admin/${resource}/${id}`),
  create: (resource: string, data: unknown) => call<Row>(`/api/admin/${resource}`, { method: "POST", body: JSON.stringify(data) }),
  bulkCreate: (resource: string, items: unknown[]) =>
    call<{ items: Row[] }>(`/api/admin/${resource}`, { method: "POST", body: JSON.stringify({ items }) }),
  update: (resource: string, id: string | number, data: unknown) =>
    call<Row>(`/api/admin/${resource}/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (resource: string, id: string | number) => call<{ ok: true }>(`/api/admin/${resource}/${id}`, { method: "DELETE" }),
  clear: (resource: string, field: string, value: string) =>
    call<{ deleted: number }>(`/api/admin/${resource}?${field}=${encodeURIComponent(value)}`, { method: "DELETE" }),
  dashboard: () => call<import("./dashboard").DashData>(`/api/admin/dashboard`),
  logout: () => call<{ ok: true }>(`/api/admin/auth/logout`, { method: "POST" }),
  demoLogin: (email: string, password: string) =>
    call<{ ok: true }>(`/api/admin/auth/login`, { method: "POST", body: JSON.stringify({ email, password }) }),
};
