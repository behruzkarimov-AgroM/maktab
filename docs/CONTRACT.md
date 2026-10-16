# Team contract (read first)

Stack: Next.js 16 (App Router, TS), Tailwind v4, next-intl, Supabase, framer-motion, gsap, lenis, recharts, xlsx, jspdf, qrcode.react, canvas-confetti. Dependencies are ALREADY installed - do not run `npm install` for existing ones (if you truly need a new package, say so in your report instead of installing, to avoid lockfile races).
Next 16 differs from older versions (e.g. `middleware` is now `proxy`; `params`/`searchParams` are Promises). Check `node_modules/next/dist/docs` if unsure. Read `AGENTS.md`.

Shared, already existing: `lib/types.ts` (Locale, LocalizedText, tr()). Do not edit it; propose additions in your report.
Spec: `README.md`. DB schema is the source of truth once `supabase/schema.sql` exists (agent "core" owns it).

## Rules
- Only write inside the files/dirs you own (below). Never edit another agent's files.
- All user-visible text must exist in uz/ru/en. Feature-specific dictionaries live next to the feature (e.g. `components/olympiad/i18n.ts`), common ones in `messages/{locale}.json` (core owns).
- Locale comes from the route: `app/[locale]/...`; use `useLocale()` from next-intl, never local locale state/switchers inside feature components.
- Every Supabase-backed feature must work in DEMO mode (no env vars) with sensible seed data/localStorage and use Supabase when `NEXT_PUBLIC_SUPABASE_URL` is set. Use `getBrowserClient()` / `getServerClient()` / `isSupabaseConfigured()` from `lib/supabase/*` (core).
- Dark/light mode via Tailwind `dark:` classes (class strategy, core sets it up). No hard-coded all-dark pages.
- Security: never expose `correct_option_id` / registrant PII to anonymous clients; use server routes or RPC functions defined in schema.sql. Validate input with zod on server routes.
- Verify with `npx tsc --noEmit` on your own files before reporting. Do not start long-running dev servers that you do not stop.
- Final report (<=200 words): files created, what works, what is stubbed, extra suggestions.

## Ownership
| Agent | Owns |
|---|---|
| core | `supabase/**`, `lib/supabase/**`, `lib/utils.ts`, `i18n/**`, `proxy.ts`, `messages/**`, `app/globals.css`, `app/layout.tsx`, `app/[locale]/layout.tsx`, `app/[locale]/not-found.tsx`, `components/layout/**` (Header, Footer, LanguageSwitcher, ThemeToggle, SmoothScroll, MobileNav), `components/ui/**` (Button, Card, AnimatedCounter, Reveal, Tabs, GlassCard), `.env.example` |
| public | `app/[locale]/page.tsx` (home), `app/[locale]/{about,programs,campus,team,achievements,contact}/**`, `components/home/**`, `components/public/**`, `app/api/applications/**`, `lib/telegram.ts` |
| learn | `app/[locale]/{olympiads,quizzes}/**`, `components/olympiad/**`, `components/quiz/**`, `app/api/{olympiad,quiz}/**`, `lib/pdf/**` |
| brain | `app/[locale]/{games,psychology}/**`, `components/games/**`, `components/psych/**`, `app/api/{games,psych}/**`, `lib/sound.ts` |
| admin | `app/admin/**`, `app/api/admin/**`, `components/admin/**`, `lib/admin/**` |
| school (SIS) | `app/school/**`, `app/api/school/**`, `components/school/**`, `lib/school/**`, the SIS section of `supabase/schema.sql` - see `docs/SIS.md` |

Routes excluded from locale routing by core's proxy (`/school` too): `/admin`, `/api`, `/_next`, static files.
Nav items (core's Header) link to: `/`, `/about`, `/programs`, `/campus`, `/team`, `/achievements`, `/olympiads`, `/quizzes`, `/psychology`, `/games`, `/contact`.
Admin auth: Supabase Auth (email+password) + `profiles.role`; in demo mode (no env) admin uses a clearly-labelled local demo login (`admin@demo.uz` / `demo1234`) with in-memory/localStorage data so the CMS can be shown.
Admin tables managed (generic trilingual CRUD): site_settings, programs, campus_life, staff_members, student_achievements, olympiads (+registrations list/search/XLSX export/results entry), academic_quizzes+questions, psych_tests+questions+result_scales, brain_games config + leaderboard moderation, admission_applications (status/notes), dashboard charts (recharts).
