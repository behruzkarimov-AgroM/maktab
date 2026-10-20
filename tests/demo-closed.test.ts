// The demo accounts (admin@demo.uz, director@demo.uz, ...) must be closed unless ALLOW_ADMIN_DEMO=true is set explicitly.
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoAllowed } from "@/lib/admin/supabase";

afterEach(() => vi.unstubAllEnvs());

describe("demo accounts are closed by default", () => {
  it("off without ALLOW_ADMIN_DEMO, also in development", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    for (const env of ["development", "production", "test"]) {
      vi.stubEnv("NODE_ENV", env);
      vi.stubEnv("ALLOW_ADMIN_DEMO", "");
      expect(demoAllowed()).toBe(false);
      vi.stubEnv("ALLOW_ADMIN_DEMO", "false");
      expect(demoAllowed()).toBe(false);
      vi.stubEnv("ALLOW_ADMIN_DEMO", "true");
      expect(demoAllowed()).toBe(true);
    }
  });
  it("never with Supabase configured or on Vercel, even when explicitly allowed", () => {
    vi.stubEnv("ALLOW_ADMIN_DEMO", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(demoAllowed()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(demoAllowed()).toBe(false);
  });
  it("the demo login endpoint answers 404 when demo is closed", async () => {
    vi.stubEnv("ALLOW_ADMIN_DEMO", "");
    const login = await import("@/app/api/admin/auth/login/route");
    const req = new Request("http://localhost/api/admin/auth/login", {
      method: "POST", headers: { "content-type": "application/json", origin: "http://localhost", host: "localhost" }, body: JSON.stringify({ email: "admin@demo.uz", password: "demo1234" }),
    });
    expect((await login.POST(req as never)).status).toBe(404);
  });
});
