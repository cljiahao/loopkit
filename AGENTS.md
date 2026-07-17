<!-- templateCentral: nextjs@5.11.0 (Supabase variant — shared project, schema per kit) -->

# AGENTS.md — loopkit

> STOP — This project diverges from the stock templateCentral Next.js stack on
> the data layer only. Auth/DB/realtime are **Supabase** (`@supabase/ssr`), not
> better-auth + Drizzle. Authorization is enforced in Postgres via **RLS**, not
> an app repository layer. Runtime matches tc: Next 16, route protection in
> `src/proxy.ts`, and `cookies()`/`headers()`/`params`/`searchParams` are async.

## What loopkit is

Standalone digital stamp-card loyalty for SG small vendors; a Merqo kit; owns
the `loopkit` schema in the shared Supabase project; reports metrics to merqo
over HTTP.

## Stack

Next.js 16 · App Router · Turbopack · TypeScript strict · Tailwind v4 · shadcn/ui
(new-york) · React Hook Form · Zod · Supabase (`@supabase/ssr`) · Vitest ·
pnpm 11 · Node ≥24 · deploy target: Vercel

## Commands

```bash
pnpm dev          # dev server — http://localhost:3000
pnpm build        # production build
pnpm test         # run test suite (vitest)
pnpm test:mutation # stryker mutation testing (scoped to src/lib; advisory)
pnpm test:e2e     # playwright e2e smoke (needs local Supabase up)
pnpm check        # prettier --check + eslint + tsc --noEmit
pnpm format       # prettier --write
```

## File Layout

```
src/app/dashboard/      — vendor console (programs, cards, stats)
src/app/c/              — customer-facing card view (QR entry point)
src/app/admin/          — Merqo-team admin console
src/app/setup/          — vendor onboarding
src/app/login/, auth/   — auth pages
src/app/api/            — route handlers (merqo metrics, etc.)
src/proxy.ts            — Supabase session refresh + /dashboard,/setup guard (Next 16)
src/lib/engine/         — stamp/points/lucky-reward core logic
src/lib/program.ts      — program CRUD + rules
src/lib/cards.ts        — customer card state
src/lib/loyalty.ts      — stamping/redemption flow
src/lib/stats.ts        — vendor-facing metrics
src/lib/merqo-vendor-status.ts — reports status/metrics to merqo over HTTP
src/lib/supabase/       — browser / server / service clients + middleware helper
src/lib/types.ts        — DB types (mirror of supabase/migrations)
src/lib/utils.ts        — cn() + shared formatting helpers
src/components/         — wheel, scratch-card, flame-layers, cup, points-bar, stamp-dots, etc.
src/components/ui/      — shadcn primitives (CLI-managed, do not hand-edit)
supabase/migrations/    — SQL schema + RLS (26 migrations)
```

Domain code (schema, programs/cards/stamps, auth pages, admin) is implemented,
per the v1 scope in `docs/superpowers/specs/2026-07-07-loopkit-core-design.md`
and `docs/superpowers/plans/2026-07-07-loopkit-core.md`. Later work is tracked
as further specs/plans in the same `docs/superpowers/{specs,plans}/` dirs.

## Rules (always)

- TypeScript strict — no `any`, no `@ts-ignore`.
- Validate all user input with Zod at every boundary (forms + server actions).
- Authorization lives in **RLS policies**, not in app code. Never widen a policy
  to "fix" a query — fix the query or the session instead.
- Use the **service-role client only** in Server Actions / Route Handlers, never
  in client components. It bypasses RLS.
- No secrets in `NEXT_PUBLIC_*`. `NEXT_PUBLIC_SUPABASE_*` are inlined at build —
  rebuild after changing them.
- `@supabase/ssr` and `@supabase/supabase-js` versions must stay compatible
  (ssr 0.10.x ↔ supabase-js 2.10x) or every query degrades to `never`.
- All Supabase clients (`src/lib/supabase/{client,server,middleware}.ts`) are
  scoped to `db: { schema: "loopkit" }` — loopkit owns that schema in the
  shared Merqo Supabase project and must never read/write another kit's schema
  (e.g. qkit's) directly. Cross-kit data goes over HTTP (the merqo metrics API),
  not a cross-schema query.
- After every new migration, regenerate `src/lib/types.ts` (`supabase gen types
typescript`) — keep the `loopkit` schema key in sync everywhere it's referenced.

## Skills

### Project skills — check here first (`.claude/skills/`)

| Skill               | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `/next-verify`      | typecheck + lint + test in one pass                          |
| `/supabase-migrate` | apply `supabase/migrations` + regenerate types (safety gate) |

### templateCentral plugin skills

templateCentral has **no Supabase support** (auth=better-auth, db=Drizzle/Kysely/Mongoose,
no realtime). Use only the stack-agnostic ones here:

| Skill                       | When to use                   |
| --------------------------- | ----------------------------- |
| `templatecentral:standards` | naming/validation drift check |

Do **not** run `templatecentral:add (auth)` or `(database)` — they install
better-auth / Drizzle and will break RLS + realtime.

## AI Harness

PreToolUse: blocks secrets and CI pipeline files only (exit 2): `.env*`
(except `.env.example`), CI/CD definitions (`.github/workflows/`,
`.github/actions/`), cert files (`.pem`/`.key`/`.p12`/`.pfx`/`.secret`),
`credentials.json`/`.netrc`/`.secrets`; a second Bash guard blocks
`--no-verify`, hook-layer bypasses (`LEFTHOOK=0`, `git -c
core.hooksPath=…`), and force-pushes to `main`. Skills, specs, and all app
code are unrestricted. SessionStart (startup/resume/clear/compact):
re-injects AGENTS.md routing context + `docs/CONSTITUTION.md` +
universal invariants so they survive compaction (PostCompact is
observability-only and cannot inject).
UserPromptSubmit: pattern-checks incoming prompts for injection phrases and
inline credentials; exit 2 blocks the prompt.
PostToolUse: incremental type-check (`pnpm exec tsc --noEmit
--incremental`) after every Edit/Write. Feedback-only.
Stop hook: runs full test suite (`pnpm test --run`); exit 2 feeds failures
to Claude via stderr; exit 0 on pass.
SubagentStop: type-gates a subagent's uncommitted TS changes before it can
hand back control.
Git hooks (lefthook): pre-commit runs format/lint/typecheck + gitleaks
secret-scan on staged files, plus a readme-coupling staleness warning;
commit-msg enforces Conventional Commits; pre-push runs the harness
integrity check + quality gate. Hard-local; coverage/changed-line gates
run in CI.
CI (GitHub Actions): hard gate on changed-line coverage (`diff-cover`
≥80%), lockfile-in-sync (`--frozen-lockfile`), a changelog-touched check, a
readme-freshness check, harness integrity, and (via `security.yml`) a
full-history gitleaks scan + `pnpm audit`.
Project skills: `.claude/skills/` | Manifest: `.claude/harness.json`

## Skills Security

- Review `SKILL.md` before installing any third-party skill — treat skills like packages.
- Scope `allowed-tools:` to the minimum (e.g. `Bash(git *)` not `Bash`).
- Never install skills that hardcode secrets or make unlisted outbound calls.

## Git Workflow

**Branch source:** Always fork from an up-to-date `main`.
Before branching: `git fetch -p` then update `main` (`git checkout main &&
git pull --ff-only`). Fork the feature FROM the freshly-pulled `main`.

loopkit is a single-branch trunk: `main` is the only long-lived branch, and
Vercel auto-deploys on every push to it. Every change lands via a
feature-branch PR into `main` — there is no `uat`/`develop` stage. The
seeded hooks protect `main` from direct commits and force-push regardless
of this route (see "AI Harness" above).

## Skill capture

- A workflow done twice → author a `.claude/skills/<name>/` project skill and commit it, so the repo (and teammates) carry it, not just session memory. `/skill-audit` surfaces repeats from `.claude/skill-usage.log`.
- Don't vendor third-party plugin skills — re-author the workflow as a project skill tuned to this repo.

## Project-Specific Notes

- This repo was seeded as a harness from the sibling project `qkit` (same
  templateCentral Supabase variant, same shared Supabase project, different
  schema). Domain code (programs/cards/stamps, auth pages, dashboard, admin)
  is implemented; v1 plan/design: `docs/superpowers/plans/2026-07-07-loopkit-core.md`
  (design: `docs/superpowers/specs/2026-07-07-loopkit-core-design.md`).
- Later features are tracked as further specs/plans in the same
  `docs/superpowers/{specs,plans}/` dirs (v2 phases, workspace phases, etc.).

<!-- [[post-harness]] — reserved for trace capture and meta-harness integration -->
