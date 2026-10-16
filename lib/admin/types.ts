// Client-safe types for the admin CMS (no server imports here).
import type { LocalizedText } from "@/lib/types";

export type AdminRole = "super_admin" | "methodist" | "psychologist";
export const ADMIN_ROLES: AdminRole[] = ["super_admin", "methodist", "psychologist"];

export type L = LocalizedText;
export const l = (uz: string, ru: string, en: string): L => ({ uz, ru, en });

export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "url"
  | "tel"
  | "password"
  | "number"
  | "boolean"
  | "select"
  | "date"
  | "datetime"
  | "color"
  | "localized" // single-line trilingual
  | "localizedArea" // multi-line trilingual
  | "image" // single image url (upload)
  | "imageList" // string[] of image urls
  | "stringList" // string[] of free texts
  | "grades" // int[] 1..11
  | "repeater" // array of objects
  | "group" // nested object
  | "gameItems"; // game_content_sets.items (editor depends on the sibling `game_type` value)

export interface Option {
  value: string;
  label: L;
  tone?: "gray" | "green" | "blue" | "amber" | "red" | "violet";
}

export interface Field {
  name: string;
  type: FieldType;
  label: L;
  help?: L;
  required?: boolean;
  /** localized: allow null in DB (optional text) */
  nullable?: boolean;
  options?: Option[];
  /** repeater / group children */
  fields?: Field[];
  itemLabel?: L;
  minItems?: number;
  maxItems?: number;
  /** repeater: automatically assign letter ids (A, B, C...) to an `id` child */
  autoId?: "letter";
  min?: number;
  max?: number;
  step?: number;
  /** number: DB column is an integer, reject decimals */
  int?: boolean;
  bucket?: "school-media" | "test-assets" | "certificates";
  /** section heading rendered before this field */
  section?: L;
  /** render at half width on md+ */
  half?: boolean;
  readOnly?: boolean;
  /** only editable while creating (e.g. slug) */
  createOnly?: boolean;
  /** shown in form but not stored (e.g. password on create) */
  virtual?: boolean;
  defaultValue?: unknown;
  placeholder?: string;
}

export type ColumnKind = "text" | "loc" | "bool" | "date" | "datetime" | "image" | "badge" | "num" | "list" | "ref" | "score" | "json";
export interface Column {
  name: string;
  kind: ColumnKind;
  label?: L;
  sortable?: boolean;
  /** for kind=ref: resource key to resolve titles from */
  ref?: string;
}

export interface FilterDef {
  name: string;
  label: L;
  options?: Option[];
  /** options are loaded from another resource (id -> title) */
  ref?: string;
}

export type ResourceGroup = "content" | "learn" | "mind" | "system";

export interface ResourceDef {
  key: string; // url slug and table name
  table: string;
  label: L;
  singular: L;
  icon: string; // lucide icon name (resolved in client)
  group: ResourceGroup;
  read: AdminRole[];
  write: AdminRole[];
  /** roles allowed to delete (defaults to `write`) */
  deleteRoles?: AdminRole[];
  fields: Field[];
  columns: Column[];
  /** DB columns (text or localized) used by the search box */
  search: string[];
  sort: { field: string; dir: "asc" | "desc" };
  /** field used for human title (localized or text) */
  titleField: string;
  activeField?: string;
  singleton?: boolean;
  parent?: { field: string; resource: string };
  filters?: FilterDef[];
  /** list row opens a detail page instead of a drawer */
  detail?: "quiz" | "psych" | "olympiad" | "survey";
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  exportable?: boolean;
  /** show in sidebar */
  nav?: boolean;
  kanban?: { field: string };
  /** allow "clear all" for the active filter (leaderboard) */
  clearBy?: string;
  pageSize?: number;
}

export interface AdminSession {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  demo: boolean;
}

export interface ListResult<T = Row> {
  rows: T[];
  total: number;
}
export type Row = Record<string, unknown> & { id: string | number };

export const isLocalized = (v: unknown): v is L =>
  !!v && typeof v === "object" && "uz" in (v as object) && "ru" in (v as object) && "en" in (v as object);
