# loopkit

Digital stamp-card loyalty for SG small vendors. A Merqo kit — owns the
`loopkit` schema in the shared Merqo Supabase project, reports metrics to
merqo over HTTP.

Vendors run a stamp/points program from `/dashboard` (programs, cards,
stamping, flame progress, "lucky" chance rewards); customers collect and view
cards from a phone-friendly `/c` flow via QR. Includes a scratch-card /
wheel reward layer, tiered plans, and an admin console for vendor
management. The dashboard's account-menu order and content deliberately
mirror qkit's (see `src/app/dashboard/dashboard-nav.tsx`) — a cross-kit
consistency goal, not a coincidence. Theme is "Raspberry-Rose Punch & Gold"
(`src/app/globals.css`) — a bright, saturated raspberry-red primary plus a
gold reward accent, chosen (over the earlier, dimmer "Mulberry & Gold") to
read as celebratory rather than moody-fintech. Form fields keep their
primary copy to one short line, pushing rationale/edge-case detail into a
shared tap-to-open `(i)` info tooltip (`src/components/info-tooltip.tsx`).

## Stack

Next.js 16 · App Router · Turbopack · TypeScript strict · Tailwind v4 ·
shadcn/ui (new-york) · React Hook Form · Zod · Supabase (`@supabase/ssr`) ·
Vitest · pnpm 11 · Node ≥24 · deploy target: Vercel

## Commands

```bash
pnpm dev            # dev server — http://localhost:3000
pnpm build          # production build
pnpm test           # run test suite (vitest)
pnpm test:mutation  # stryker mutation testing (scoped to src/lib; advisory)
pnpm test:e2e       # playwright e2e smoke (needs local Supabase up)
pnpm check          # prettier --check + eslint + tsc --noEmit
pnpm format         # prettier --write
```

## File layout

```
src/app/dashboard/     — vendor console (programs, cards, stats)
src/app/c/              — customer-facing card view (QR entry point)
src/app/admin/          — Merqo-team admin console
src/app/setup/          — vendor onboarding
src/app/login/          — auth pages
src/lib/engine/         — stamp/points/lucky-reward core logic
src/lib/program.ts      — program CRUD + rules
src/lib/cards.ts        — customer card state
src/lib/loyalty.ts      — stamping/redemption flow
src/lib/stats.ts        — vendor-facing metrics
src/lib/merqo-vendor-status.ts — reports status/metrics to merqo over HTTP
src/lib/supabase/       — browser / server / service clients (schema: loopkit)
src/components/         — wheel, scratch-card, flame-layers, cup, points-bar, stamp-dots, etc.
supabase/migrations/    — SQL schema + RLS
```

## Data model

Owns the `loopkit` schema in the shared Merqo Supabase project. All
Supabase clients are scoped to `db: { schema: "loopkit" }` — loopkit never
reads/writes another kit's schema (e.g. qkit's) directly. Cross-kit data
goes over HTTP (the merqo metrics API), except one deliberate exception: a
vendor's stall name and social links live in the shared `merqo.vendor_profile`
table (same Postgres instance, different schema), read/written only through
two `SECURITY DEFINER` RPCs (`get_or_create_vendor_profile`/
`upsert_vendor_profile`) — never a raw cross-schema query. See
`src/lib/merqo-vendor-profile.ts` and
`docs/business/2026-07-21-profile-settings-page-standard.md` (in the parent
`Merqo Business/docs/` repo) for the locked cross-kit pattern.

## Docs

- Deploy runbook: `docs/DEPLOY.md`
- Plans/specs: `docs/superpowers/`
- Release history: `CHANGELOG.md`

See `AGENTS.md` for full engineering rules, harness details, and skills.

## Structure

### Contents

- `.claude/` — Claude Code harness: hooks, project skills, harness manifest
- `.github/` — CI workflows
- `.lefthook/` — git commit-msg gate script
- `docs/` — deploy runbook, superpowers specs/plans, CONSTITUTION
- `e2e/` — Playwright end-to-end smoke + signed-out route-protection tests (both run without Supabase provisioning)
- `src/` — application source (App Router pages, lib, components)
- `supabase/` — SQL migrations and seed data
- `test/` — Vitest unit/integration tests

### Connectivity

`src/app/` (App Router pages) composes from `src/lib/` (domain logic, Supabase
clients, the stamp/points/lucky engine) and `src/components/` (shared UI).
`supabase/migrations/` is the schema `src/lib/types.ts` mirrors by hand and
`src/lib/supabase/` connects to at runtime. `test/` mirrors `src/`'s
structure one-to-one for unit/integration coverage; `e2e/` drives the app
as a browser would, independent of that structure. `.claude/` and
`.github/` are the enforcement layer around all of the above — they gate
what can be committed/merged but contain no application logic themselves.
