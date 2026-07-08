# loopkit Workspace Phase A — Multi-program + Pro gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** A vendor can own **many** programs (free = 1, Pro = unlimited, admin-granted). The dashboard operates on a **current** program chosen by `?p=<id>`. No customer-facing (`/c`) change.

**Architecture:** Drop the `programs.vendor_id` UNIQUE constraint; add a `vendor_pro` allow-list + `is_pro`. A new program-access layer (`listPrograms`/`getProgramById`/`isPro`/`canCreateProgram`/`currentProgram`) replaces the single-`getProgram` assumption. Dashboard actions now take a `program_id` from the form (RLS still authorizes — a vendor can only resolve their own programs).

**Tech Stack:** Next 16, TS strict, Supabase (schema `loopkit`), Vitest, pnpm 11. Builds on v2 (engine, migrations 0004–0006).

## Global Constraints

- TS strict; no `any`/`@ts-ignore`; no inline comments; match existing style.
- RLS scopes everything to the owning vendor; the gate is enforced server-side in the create action (never trust the client).
- Schema change → migration `0007_*` + `src/lib/types.ts` + drift test.
- Free limit = **1** program; Pro = unlimited. Pro = presence in `loopkit.vendor_pro` (admin/SQL-granted).
- Every task ends green: `pnpm check && pnpm test && pnpm build`.
- Spec: `docs/superpowers/specs/2026-07-08-loopkit-vendor-workspace-design.md`.

---

### Task 1: Migration 0007 — multi-program + `vendor_pro`

**Files:** Create `supabase/migrations/0007_loopkit_multiprogram.sql`; Modify `src/lib/types.ts`, `docs/DEPLOY.md`; Test `test/db/multiprogram-schema.test.ts`.

- [ ] **Step 1: Drift test** asserting: `drop constraint if exists` on the programs vendor_id unique; `create table loopkit.vendor_pro`; `is_pro` SECURITY DEFINER; grants to `authenticated`; footer bootstrap comment.

- [ ] **Step 2: Write the migration**

```sql
-- supabase/migrations/0007_loopkit_multiprogram.sql
-- A vendor may now own many programs (free = 1, Pro = unlimited). Drop the
-- one-program-per-vendor unique constraint; add a Pro allow-list + predicate.
-- The free/Pro limit is enforced in the create action (server-side), not here.

alter table loopkit.programs
  drop constraint if exists programs_vendor_id_key;
create index if not exists programs_vendor_idx on loopkit.programs (vendor_id);

create table loopkit.vendor_pro (
  vendor_id  uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function loopkit.is_pro(p_uid uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from loopkit.vendor_pro where vendor_id = p_uid);
$$;

alter table loopkit.vendor_pro enable row level security;
create policy vendor_pro_self_or_admin_select on loopkit.vendor_pro
  for select using (
    vendor_id = (select auth.uid()) or loopkit.is_admin((select auth.uid()))
  );

grant select on loopkit.vendor_pro to authenticated;
grant all on loopkit.vendor_pro to service_role;
grant execute on function loopkit.is_pro(uuid) to authenticated, service_role;

-- Grant a vendor Pro (admin/SQL only; there is no self-serve billing yet):
--   insert into loopkit.vendor_pro (vendor_id) values ('<VENDOR_AUTH_USER_ID>');
```

Note: confirm the exact unique-constraint name in `0001` (Postgres auto-names `<table>_<col>_key` → `programs_vendor_id_key`); if 0001 named it differently, use that name. `drop constraint if exists` is safe either way — the drift test only checks the statement exists.

- [ ] **Step 3:** `src/lib/types.ts` — add `vendor_pro` table + `is_pro` rpc. **Step 4:** `docs/DEPLOY.md` — apply 0007 + the grant-Pro note. **Step 5:** test PASS; `pnpm check && pnpm test && pnpm build` green; commit `feat: 0007 multi-program + vendor_pro`.

---

### Task 2: Program access layer

**Files:** Modify `src/lib/program.ts`; Test `test/lib/program-access.test.ts`.

**Interfaces:**

- `listPrograms(): Promise<Program[]>` — the vendor's programs (RLS-scoped), ordered by `created_at`.
- `getProgramById(id: string): Promise<Program | null>` — one, RLS-scoped.
- `currentProgram(programs: Program[], requestedId?: string): Program | null` — pure: the requested-and-owned program, else `programs[0] ?? null`.
- `isPro(): Promise<boolean>` — `from("vendor_pro").select("vendor_id").eq("vendor_id", user.id).maybeSingle()` → `!!data` (needs the user id; read via `requireVendor` or `getUser`).
- `canCreateProgram(count: number, pro: boolean): boolean` — pure: `pro || count < 1`.
- Keep `Program` type (already has `type`,`config`). The old `getProgram()` may remain as `= listPrograms()[0] ?? null` ONLY if a caller still needs it; prefer updating callers (Tasks 3–4).

- [ ] **Steps:** unit-test the two pure fns (`currentProgram` selection incl. unowned requestedId falls back to first; `canCreateProgram` truth table), write the reads (mirror existing `getProgram` query shape, drop `.maybeSingle()` for the list). Green; commit `feat: multi-program access layer`.

---

### Task 3: `/setup` — list + gated create + edit

**Files:** Modify `src/app/setup/page.tsx`, `src/app/setup/setup-form.tsx`, `src/app/setup/actions.ts`, `src/lib/program.ts` (schema already there).

- [ ] `/setup` (server): `const programs = await listPrograms()`. If `searchParams.edit` → load that program into the form (edit mode). Else show: a list of the vendor's programs (name · type · `Edit` link `/setup?edit=<id>` · a "Manage" link to `/dashboard?p=<id>`) and a **"Create a program"** form (the existing `setup-form`), UNLESS at the free limit — then show an upsell card instead ("Free plan: 1 program. Ask for Pro to add more.") with the create form hidden. Compute `const pro = await isPro(); const canCreate = canCreateProgram(programs.length, pro)`.
- [ ] `saveProgramAction`: on CREATE, re-check server-side `canCreateProgram(count, pro)`; if false return an error state (`"You're on the free plan — 1 program. Ask an admin for Pro."`). On EDIT (an `id` present + owned) update that program. Redirect to `/dashboard?p=<id>` after either.
- [ ] The first-run path stays: a vendor with 0 programs landing on `/dashboard` is redirected to `/setup`.
- [ ] Test the gated create (free at limit → error; pro → ok) with mocked `isPro`/counts. Green; commit `feat: /setup program list + gated create + edit`.

---

### Task 4: Dashboard on a current program (thread program_id)

**Files:** Modify `src/app/dashboard/page.tsx`, `src/app/dashboard/actions.ts`, and the counter forms (`stamp-form.tsx`, `lucky-form.tsx`, `plant-form.tsx`, `card-lookup.tsx`, `redeem-button.tsx`).

- [ ] `dashboard/page.tsx`: `const programs = await listPrograms(); const program = currentProgram(programs, (await searchParams).p); if (!program) redirect("/setup");`. Recent-activity query: filter events to the **current program's** cards (join through `cards.program_id = program.id`, or read that program's card ids first). Pass `programId={program.id}` to every counter form. (The customer-card panel already uses `program.id`.) Render a minimal switcher if `programs.length > 1` (a `<select>` navigating `/dashboard?p=<id>`) — full header UX is Phase B; here just make it functional.
- [ ] `dashboard/actions.ts`: `stampAction`, `recordVisitAction`, `lookupAction`, and the redeem actions currently call `getProgram()` (single). Change each to read `program_id` from `formData` and resolve via `getProgramById(program_id)` (returns null if not owned → error). RLS already blocks cross-vendor; this just selects which of the vendor's programs.
- [ ] Each counter form: add a hidden `<input name="program_id" value={programId}>` (they take a new `programId: string` prop) so the action knows which program.
- [ ] Update the affected action tests to pass `program_id` and mock `getProgramById`. Green; commit `feat: dashboard scoped to a current program`.

---

## Self-Review

**Spec coverage (§1–4, §7 Phase A):** drop unique + vendor_pro + is_pro (Task 1); access layer incl. gate (Task 2); /setup list+gated-create+edit (Task 3); dashboard current-program + program_id threading + scoped activity (Task 4). Admin Pro toggle = Phase C (SQL grant works now). Dashboard header/switcher polish + merged serve-flow = Phase B. `/c` untouched ✓.

**Placeholder scan:** migration + signatures + gate logic are exact; UI steps name the files, props, and the exact redirect/queries.

**Type consistency:** `listPrograms`/`getProgramById`/`currentProgram`/`isPro`/`canCreateProgram` used across Tasks 2–4; `program_id` threaded form→action via a hidden input + `getProgramById`; `Program` type reused (already carries `type`/`config`).
