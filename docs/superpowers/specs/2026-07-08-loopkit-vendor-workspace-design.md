# loopkit vendor workspace (v2.1) — design

**Status:** approved direction (2026-07-08, user "fix all of it"). Supersedes the one-program assumption.

**Goal:** Make a vendor able to run **multiple loyalty programs** (gated: free = 1, Pro = unlimited, admin-granted — no billing yet), and revamp the vendor dashboard so it reads as a clear workspace instead of a wall of boxes.

**In scope:**

1. **Multi-program data model** — drop the one-program-per-vendor constraint; a vendor has a _list_ of programs; the dashboard operates on a _current_ one.
2. **Free/Pro gate** — free vendors get 1 program; Pro (an admin-granted allow-list) get unlimited. Enforced server-side at create time.
3. **Dashboard revamp** — program header (name · type · reward · Edit), a program switcher (when >1), and one merged "identify a customer → stamp/redeem" flow (folds in today's separate look-up box). Keep the just-shipped customer-card panel + recent activity.
4. **`/setup` → program create/list** — create a new program (gated), edit an existing one, see your programs.

**Out of scope / deferred:** Stripe/self-serve billing (Pro stays admin-granted per the [[project_merqo]] ecosystem stance until ACRA); Streak/Points/Referral templates; NFC; wallet passes; SMS.

**Non-negotiables:** stamp/redeem/play stay vendor-gated; RLS scopes every read/write to the owning vendor; no behavior change to the customer `/c` surface (each program already has its own `/c?p=<id>` link).

---

## 1. Data model (migration `0007_loopkit_multiprogram.sql`)

- **Drop the single-program constraint:** `programs.vendor_id` is currently `UNIQUE`. Drop that unique constraint (keep the column + FK + RLS). A vendor may now own many programs. Add an index on `programs.vendor_id` for the list query.
- **Pro allow-list:** `create table loopkit.vendor_pro (vendor_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz default now())`. Presence = Pro. RLS: a vendor may read their own row (to know their tier); admins read all; writes are service-role/admin only. `is_pro(uid)` SECURITY DEFINER helper (mirrors `is_admin`).
- **Program-count gate helper (optional):** enforcement lives in the TS create action (count existing + tier), so no SQL gate needed; but add `is_pro` for the RLS/read.
- Grants mirror existing conventions (`grant select on loopkit.vendor_pro to authenticated`; `grant execute on is_pro to authenticated`). Update `src/lib/types.ts`.

**Migration safety:** dropping a UNIQUE constraint is additive-compatible (existing single programs stay valid). Idempotent guards (`drop constraint if exists`).

## 2. Program access layer (`src/lib/program.ts`)

Today: `getProgram()` returns the vendor's single program (RLS `.maybeSingle()`). Change to:

- `listPrograms(): Promise<Program[]>` — all of the vendor's programs, newest-or-name ordered.
- `getProgramById(id): Promise<Program | null>` — one, RLS-scoped (vendor owns it).
- `currentProgram(programs, requestedId?)` — pick the requested id if present + owned, else the first; returns `Program | null`.
- `isPro(): Promise<boolean>` — reads `vendor_pro` (cookie client, RLS) or calls `is_pro`.
- `canCreateProgram(count, pro): boolean` — pure: `pro || count < 1`. Unit-tested.
- Keep a thin `getProgram()` shim (= first program) only where a single-program assumption is acceptable during transition, or remove and update callers. Prefer updating callers.

**Callers to update:** `/dashboard` (+ its actions read the current program from a param, not `getProgram`), `/dashboard/customers`, `/setup`, the metrics endpoint (`computeLoopkitMetrics` — aggregate across all the vendor's programs, or keep per-program; simplest: metrics already service-role reads all loopkit — unaffected, verify).

## 3. `/setup` → create + list + edit

- `/setup` becomes: a list of the vendor's programs (name · type · Edit), and a **"New program"** button. New/Edit reuse the existing `setup-form` (type picker + per-type config).
- **Gate:** the create action calls `canCreateProgram(count, pro)`; if false, return an error state that the form renders as an **upsell** ("You're on the free plan — 1 program. Ask for Pro to add more."). Edit is always allowed.
- After create/edit → redirect to `/dashboard?p=<newId>`.
- First-run (0 programs) still lands on `/setup` to make the first one (dashboard redirects to `/setup` when the vendor has none).

## 4. Dashboard revamp (`/dashboard`)

Reads `?p=<programId>` (searchParams) → `currentProgram`. Layout, top to bottom:

1. **Program header** — program name (h1), a **type badge** (Stamp / Lucky / Sprout), the reward line, and an **Edit** link (`/setup?edit=<id>`); if the vendor has >1 program, a **switcher** (a `<select>` or segmented control of their programs → navigates `/dashboard?p=<id>`); a **"New program"** link (gated affordance).
2. **Serve a customer** — ONE flow that merges today's stamp form + look-up: identify a customer (type phone or **Scan**), then act — stamp/play/water AND, when their card is full, **Redeem** — from the same result card. (Fold `card-lookup` behavior into the per-type form's result; the separate "Look up a card" box goes away.)
3. **Your customer card** — the shipped link + printable QR panel (scoped to the current program).
4. **Recent activity** — unchanged (scoped to the current program's cards; today it's all the vendor's events — filter to the current program).

Keep it visually calmer: the header is the anchor; "Serve a customer" is the one primary action; the card + activity are secondary.

## 5. Admin (`/admin`) — grant Pro

Add a small **Pro** control to the existing loopkit `/admin` (built in 0003): list vendors (from programs' `vendor_id` + email via `auth.admin.listUsers`), show tier, and a **Make Pro / Remove Pro** action (service-role write to `vendor_pro`, audited via `admin_audit`). SQL remains the fallback.

## 6. Testing

- Pure: `canCreateProgram`, `currentProgram` selection.
- Migration `0007` drift guard.
- Action tests: create-gated (free at limit → error; pro → ok), program switching resolves the right program.
- Existing engine/type tests unaffected.

## 7. Rollout (phases for the plan)

- **Phase A — multi-program data + gate + program access layer** (migration 0007, `vendor_pro`/`is_pro`, `listPrograms`/`getProgramById`/`isPro`/`canCreateProgram`; `/setup` create-list-edit with the gate; dashboard reads `?p=` current program; recent-activity scoped to current). Ships multi-program.
- **Phase B — dashboard revamp UX** (program header + switcher + the merged identify→stamp/redeem flow folding in look-up). Ships the calmer workspace.
- **Phase C — admin Pro toggle** (nice-to-have; SQL works meanwhile).

## Open decisions (resolve in plan)

- Merged flow: keep `card-lookup` as the identify-first entry and add stamp/play/water to its result, or extend each type form to also expose Redeem when full. (Lean: one `ServeCustomer` component that identifies once, shows the card via `getProgress`, then offers the type action + Redeem.)
- Free limit constant (1) — confirm 1, not 2.
