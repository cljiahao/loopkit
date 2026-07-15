# loopkit

Digital stamp-card loyalty for SG small vendors. A Merqo kit — owns the
`loopkit` schema in the shared Merqo Supabase project, reports metrics to
merqo over HTTP.

Vendors run a stamp/points program from `/dashboard` (programs, cards,
stamping, flame progress, "lucky" chance rewards); customers collect and view
cards from a phone-friendly `/c` flow via QR. Includes a scratch-card /
wheel reward layer, tiered plans, and an admin console for vendor
management.

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
src/components/         — wheel, scratch-card, flame-layers, stamp-dots, etc.
supabase/migrations/    — SQL schema + RLS
```

## Data model

Owns the `loopkit` schema in the shared Merqo Supabase project. All
Supabase clients are scoped to `db: { schema: "loopkit" }` — loopkit never
reads/writes another kit's schema (e.g. qkit's) directly. Cross-kit data
goes over HTTP (the merqo metrics API).

## Docs

- Deploy runbook: `docs/DEPLOY.md`
- Plans/specs: `docs/superpowers/`

See `AGENTS.md` for full engineering rules, harness details, and skills.
