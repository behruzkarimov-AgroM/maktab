import { z } from "zod";

/**
 * Validated environment access.
 *  - publicEnv(): NEXT_PUBLIC_* values (safe in browser and server).
 *  - serverEnv(): server-only secrets (throws if called in the browser).
 *  - envReport(): never throws; used by /api/health to describe problems without leaking values.
 * Empty strings are treated as "not set". Leaving Supabase vars empty selects DEMO mode.
 */

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n - ${issues.join("\n - ")}\nSee .env.example and supabase/README.md.`);
    this.name = "EnvError";
  }
}

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = <T extends z.ZodType>(s: T) => z.preprocess(blank, s.optional());

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: opt(z.url({ message: "must be a full URL, e.g. https://xxxx.supabase.co" })),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: opt(z.string().min(20, "looks too short to be a Supabase anon key")),
  NEXT_PUBLIC_SITE_URL: opt(z.url({ message: "must be a full URL, e.g. https://example.uz" })),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: opt(z.string().min(20, "looks too short to be a Supabase service_role key")),
  TELEGRAM_BOT_TOKEN: opt(z.string().regex(/^\d+:[\w-]{20,}$/, "expected format 123456:ABC-DEF...")),
  TELEGRAM_CHAT_ID: opt(z.string().regex(/^-?\d+$/, "expected a numeric chat id")),
  ALLOW_ADMIN_DEMO: opt(z.enum(["true", "false"])),
  SMS_PROVIDER: opt(z.string().max(40)),
  SMS_API_URL: opt(z.url()),
  SMS_API_TOKEN: opt(z.string().min(8)),
  SMS_SENDER: opt(z.string().max(20)),
  // document import: optional AI structuring (extracted text only is sent) and the OCR feature flag
  ANTHROPIC_API_KEY: opt(z.string().min(20, "looks too short to be an Anthropic API key")),
  ANTHROPIC_MODEL: opt(z.string().max(80)),
  IMPORT_OCR: opt(z.enum(["on", "off"])),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

function fmt(prefixIssues: z.core.$ZodIssue[]): string[] {
  return prefixIssues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`);
}

/** NEXT_PUBLIC_* must be referenced literally so Next.js can inline them into the client bundle. */
function rawPublic() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  };
}

function rawServer() {
  return {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    ALLOW_ADMIN_DEMO: process.env.ALLOW_ADMIN_DEMO,
    SMS_PROVIDER: process.env.SMS_PROVIDER,
    SMS_API_URL: process.env.SMS_API_URL,
    SMS_API_TOKEN: process.env.SMS_API_TOKEN,
    SMS_SENDER: process.env.SMS_SENDER,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
    IMPORT_OCR: process.env.IMPORT_OCR,
  };
}

function crossChecks(p: PublicEnv, s?: Partial<ServerEnv>): string[] {
  const issues: string[] = [];
  if (Boolean(p.NEXT_PUBLIC_SUPABASE_URL) !== Boolean(p.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    issues.push("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set together (or both empty for DEMO mode)");
  }
  if (s?.SUPABASE_SERVICE_ROLE_KEY && !p.NEXT_PUBLIC_SUPABASE_URL) {
    issues.push("SUPABASE_SERVICE_ROLE_KEY is set but NEXT_PUBLIC_SUPABASE_URL is missing");
  }
  if (Boolean(s?.TELEGRAM_BOT_TOKEN) !== Boolean(s?.TELEGRAM_CHAT_ID)) {
    issues.push("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set together");
  }
  return issues;
}

let cachedPublic: PublicEnv | undefined;
export function publicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;
  const r = publicSchema.safeParse(rawPublic());
  if (!r.success) throw new EnvError(fmt(r.error.issues));
  const issues = crossChecks(r.data);
  if (issues.length) throw new EnvError(issues);
  return (cachedPublic = r.data);
}

let cachedServer: (PublicEnv & ServerEnv) | undefined;
export function serverEnv(): PublicEnv & ServerEnv {
  if (typeof window !== "undefined") throw new Error("serverEnv() must not be called in the browser");
  if (cachedServer) return cachedServer;
  const p = publicSchema.safeParse(rawPublic());
  const s = serverSchema.safeParse(rawServer());
  const issues = [...(p.success ? [] : fmt(p.error.issues)), ...(s.success ? [] : fmt(s.error.issues))];
  if (p.success && s.success) issues.push(...crossChecks(p.data, s.data));
  if (issues.length || !p.success || !s.success) throw new EnvError(issues);
  return (cachedServer = { ...p.data, ...s.data });
}

/** True when public Supabase config is present AND valid. Never throws. */
export function isSupabaseEnvValid(): boolean {
  const r = publicSchema.safeParse(rawPublic());
  return r.success && Boolean(r.data.NEXT_PUBLIC_SUPABASE_URL && r.data.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export type EnvReport = {
  mode: "demo" | "supabase";
  valid: boolean;
  problems: string[];
  features: { serviceRole: boolean; telegram: boolean; sms: boolean; siteUrl: boolean; adminDemo: boolean };
};

/** Describes configuration state without exposing any value. Never throws. */
export function envReport(): EnvReport {
  const p = publicSchema.safeParse(rawPublic());
  const s = serverSchema.safeParse(rawServer());
  const problems = [...(p.success ? [] : fmt(p.error.issues)), ...(s.success ? [] : fmt(s.error.issues))];
  if (p.success && s.success) problems.push(...crossChecks(p.data, s.data));
  const pd = p.success ? p.data : ({} as Partial<PublicEnv>);
  const sd = s.success ? s.data : ({} as Partial<ServerEnv>);
  return {
    mode: pd.NEXT_PUBLIC_SUPABASE_URL && pd.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "supabase" : "demo",
    valid: problems.length === 0,
    problems,
    features: {
      serviceRole: Boolean(sd.SUPABASE_SERVICE_ROLE_KEY),
      telegram: Boolean(sd.TELEGRAM_BOT_TOKEN && sd.TELEGRAM_CHAT_ID),
      sms: Boolean(sd.SMS_API_URL && sd.SMS_API_TOKEN),
      siteUrl: Boolean(pd.NEXT_PUBLIC_SITE_URL),
      adminDemo: sd.ALLOW_ADMIN_DEMO === "true",
    },
  };
}
