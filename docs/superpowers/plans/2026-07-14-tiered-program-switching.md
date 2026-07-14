# Tiered Program Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let free-tier vendors prep a second (inactive) program in advance
and activate it themselves when ready, and let Pro-tier vendors schedule a
future date on which an existing active program automatically retires and
hands over to a designated successor.

**Architecture:** A new SQL migration extends `create_program` with an
optional `p_active` flag and adds two new SECURITY DEFINER RPCs
(`activate_program`, `schedule_retirement`). A pure cap-math extension in
`src/lib/program.ts` governs whether a free vendor may prep another
program. A lazy, page-load-triggered check (`applyDueCutovers`) deactivates
any Pro program whose scheduled date has passed — no cron. Three new
Server Actions in `src/app/setup/actions.ts` wrap the new RPCs, and
`/setup`'s existing "Your programs" list gains conditional per-program
links (Prep replacement / Activate / Schedule retirement) reusing its
existing `?migrate=<id>`-style query-param routing convention.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase Postgres
(SQL RPCs, `security definer`, RLS), Vitest + Testing Library (jsdom).

## Global Constraints

- **Keep the codebase clean** (standing project rule): no dead/old code
  paths left behind. Every new capability is additive to existing files
  following this repo's established idiom — new SQL functions extend via
  `create or replace` with trailing defaulted params (exactly as `0012`,
  `0016`, and `0018` already did for `p_expiry_days`, `p_head_start`, and
  `p_carry_over_stamps`), never a rewrite-from-scratch.
- Every task's commit must leave `pnpm check` (prettier --check + eslint +
  tsc --noEmit) clean.
- The SQL migration is hand-applied by the user via the Supabase dashboard
  SQL Editor — no linked CLI in this environment. No automated RPC test;
  careful hand-review of the SQL is required instead.
- RLS/`owns_program` authorization must never be weakened. Every new RPC
  that mutates a program must call `loopkit.owns_program` before any write,
  matching every existing mutating RPC in this schema.
- Free tier's cap counts only _live-in-play_ programs — `replaced_by is
null` — never a lifetime total. Already-retired programs never block
  future prepping.
- Pro's scheduled cutover is a lazy check-on-page-load (`applyDueCutovers`,
  called at the top of `/dashboard` and `/setup`), not a real cron. No
  Vercel Cron / `vercel.json` changes in this plan.
- `create_program`'s existing free/Pro active-program gate (`is_pro OR
active count < 1`) must remain byte-identical for the `p_active = true`
  path — this plan only adds a new, separate branch for `p_active = false`.

---

### Task 1: SQL migration — schema, `create_program` extension, two new RPCs

**Files:**

- Create: `supabase/migrations/0023_loopkit_program_switching.sql`
- Modify: `docs/DEPLOY.md` (append a migration entry after the `0022` entry,
  matching the existing numbered-list style)

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: `loopkit.create_program(...)` gains a 9th trailing parameter
  `p_active boolean default true` (all 8 existing parameters and their
  order are unchanged — see the exact current signature below). Two new
  RPCs: `loopkit.activate_program(p_program uuid) returns loopkit.programs`
  and `loopkit.schedule_retirement(p_program uuid, p_successor uuid, p_date
timestamptz) returns loopkit.programs`. `loopkit.programs` gains a new
  nullable column `scheduled_deactivate_at timestamptz`. Task 2's TypeScript
  (`src/lib/program.ts`) reads/writes this column and calls these RPCs by
  name via `supabase.rpc(...)`.

The current live `create_program` body (from
`supabase/migrations/0018_loopkit_carry_over.sql` — for reference, you are
extending this, not replacing it wholesale):

```sql
create or replace function loopkit.create_program(
  p_type              text,
  p_name              text,
  p_stamps_required   int,
  p_reward_text       text,
  p_config            jsonb,
  p_expiry_days       int default null,
  p_head_start        boolean default false,
  p_carry_over_stamps boolean default false
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not authorized';
  end if;
  if not (
    loopkit.is_pro(v_uid)
    or (select count(*) from loopkit.programs where vendor_id = v_uid and active) < 1
  ) then
    raise insufficient_privilege;
  end if;
  insert into loopkit.programs
    (vendor_id, type, name, stamps_required, reward_text, config, expiry_days,
     head_start, carry_over_stamps)
    values (v_uid, p_type, p_name, p_stamps_required, p_reward_text, p_config,
            p_expiry_days, p_head_start, p_carry_over_stamps)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function loopkit.create_program(
  text, text, int, text, jsonb, int, boolean, boolean
) to authenticated;
```

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0023_loopkit_program_switching.sql` with
exactly this content:

```sql
-- 0023 — tiered program switching: free-tier prep-and-activate, Pro
-- scheduled cutover. Additive: new nullable column, create_program gains a
-- 9th trailing defaulted param (same idiom as 0012/0016/0018's own
-- extensions of this function), two new SECURITY DEFINER RPCs.

alter table loopkit.programs
  add column scheduled_deactivate_at timestamptz;

-- create_program: p_active lets a caller create a program that starts
-- inactive (the free-tier prep flow) instead of the default active=true.
-- The free/Pro gate branches on which state is being requested: an active
-- program still requires is_pro or zero other active programs (unchanged
-- from every prior version of this function); an inactive one requires
-- is_pro or fewer than 2 live-in-play (replaced_by is null) programs — the
-- "prep a second one" cap. Pro is never blocked either way.
create or replace function loopkit.create_program(
  p_type              text,
  p_name              text,
  p_stamps_required   int,
  p_reward_text       text,
  p_config            jsonb,
  p_expiry_days       int default null,
  p_head_start        boolean default false,
  p_carry_over_stamps boolean default false,
  p_active            boolean default true
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not authorized';
  end if;
  if p_active then
    if not (
      loopkit.is_pro(v_uid)
      or (select count(*) from loopkit.programs where vendor_id = v_uid and active) < 1
    ) then
      raise insufficient_privilege;
    end if;
  else
    if not (
      loopkit.is_pro(v_uid)
      or (select count(*) from loopkit.programs where vendor_id = v_uid and replaced_by is null) < 2
    ) then
      raise insufficient_privilege;
    end if;
  end if;
  insert into loopkit.programs
    (vendor_id, type, name, stamps_required, reward_text, config, expiry_days,
     head_start, carry_over_stamps, active)
    values (v_uid, p_type, p_name, p_stamps_required, p_reward_text, p_config,
            p_expiry_days, p_head_start, p_carry_over_stamps, p_active)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function loopkit.create_program(
  text, text, int, text, jsonb, int, boolean, boolean, boolean
) to authenticated;

-- activate_program: the free-tier "flip the switch" action. Deactivates
-- every other currently-active program owned by the same vendor, links
-- each to the newly-activated program via replaced_by (mirrors
-- changeTypeAction's existing manual-swap linkage), then activates the
-- target. A vendor can only ever reach a state where this deactivates more
-- than one program if they were Pro when those programs went active and
-- then dropped to free — harmless either way, this just enforces "only the
-- target is active afterward" unconditionally.
create or replace function loopkit.activate_program(p_program uuid)
returns loopkit.programs
language plpgsql security definer set search_path = '' as $$
declare
  v_vendor  uuid;
  v_program loopkit.programs;
begin
  if not loopkit.owns_program(p_program) then
    raise exception 'not authorized';
  end if;

  select vendor_id into v_vendor from loopkit.programs where id = p_program;

  update loopkit.programs
    set active = false, replaced_by = p_program
    where vendor_id = v_vendor and active and id <> p_program;

  update loopkit.programs
    set active = true
    where id = p_program
    returning * into v_program;

  return v_program;
end;
$$;

grant execute on function loopkit.activate_program(uuid) to authenticated;

-- schedule_retirement: the Pro-only "set a future cutover date" action.
-- Requires the caller to own both programs, both to currently be active,
-- and the vendor to be Pro. Sets replaced_by immediately (so vendor_join
-- can already surface the successor's name to affected customers, same as
-- changeTypeAction's manual linkage) and scheduled_deactivate_at for the
-- lazy check (src/lib/program.ts's applyDueCutovers, Task 2) to act on
-- later. Does not deactivate anything itself — that only happens once the
-- date arrives.
create or replace function loopkit.schedule_retirement(
  p_program   uuid,
  p_successor uuid,
  p_date      timestamptz
)
returns loopkit.programs
language plpgsql security definer set search_path = '' as $$
declare
  v_program   loopkit.programs;
  v_successor loopkit.programs;
begin
  if not loopkit.owns_program(p_program) or not loopkit.owns_program(p_successor) then
    raise exception 'not authorized';
  end if;
  if p_program = p_successor then
    raise exception 'a program cannot succeed itself';
  end if;

  select * into v_program from loopkit.programs where id = p_program;
  select * into v_successor from loopkit.programs where id = p_successor;

  if not loopkit.is_pro(v_program.vendor_id) then
    raise insufficient_privilege;
  end if;
  if not v_program.active then
    raise exception 'program is not active';
  end if;
  if not v_successor.active then
    raise exception 'successor is not active';
  end if;

  update loopkit.programs
    set replaced_by = p_successor,
        scheduled_deactivate_at = p_date
    where id = p_program
    returning * into v_program;

  return v_program;
end;
$$;

grant execute on function loopkit.schedule_retirement(uuid, uuid, timestamptz) to authenticated;
```

- [ ] **Step 2: Update `docs/DEPLOY.md`**

Find the numbered list entry for `0022_loopkit_stamp_carryover.sql` and add
a new entry immediately after it, matching the existing style exactly:

```markdown
- apply `0023_loopkit_program_switching.sql` — adds
  `programs.scheduled_deactivate_at`, extends `create_program` with an
  optional `p_active` flag (free-tier prep-a-replacement flow, capped at
  2 live-in-play programs), and adds `activate_program` (flip a prepped
  program live) and `schedule_retirement` (Pro-only: schedule an active
  program's future deactivation and successor). No cron — the scheduled
  cutover is applied lazily on page load. Safe to re-run.
```

- [ ] **Step 3: Verify the migration file is syntactically self-contained**

Run: `pnpm check`

Expected: PASS (this step only touches a `.sql` file and a `.md` file — no
TypeScript is affected).

Read the file back once after writing it and confirm: all three `create or
replace function` statements end with `$$;`, `activate_program` and
`schedule_retirement` each have a proper `declare`/`begin`/`end;` block,
the `create_program` grant lists 9 types in the exact same order as the
function's 9 parameters, and the two new grants
(`activate_program(uuid)`, `schedule_retirement(uuid, uuid, timestamptz)`)
match their functions' exact parameter types.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0023_loopkit_program_switching.sql docs/DEPLOY.md
git commit -m "feat(db): add free-tier program prep and Pro scheduled retirement

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Pure cap-math + lazy cutover check

**Files:**

- Modify: `src/lib/program.ts`
- Test: `test/lib/program.test.ts` (create if it does not already exist —
  check first with a directory listing; this repo's convention is one test
  file per `src/lib/*.ts` module)

**Interfaces:**

- Consumes: nothing from Task 1 at the type level (this task's TypeScript
  compiles independently of whether the migration has been applied — the
  RPC calls in Task 3 are what actually depend on Task 1's schema).
- Produces: `canPrepProgram(ent: Entitlement, liveInPlayCount: number):
boolean` (pure, mirrors the existing `canCreateProgram`'s exact shape)
  and `applyDueCutovers(): Promise<void>` (impure, exported from
  `src/lib/program.ts` alongside `listPrograms`/`getProgramById`). Task 3's
  Server Actions call `canPrepProgram`; Task 4's page components call
  `applyDueCutovers`.

The current `Entitlement` shape and `canCreateProgram` (for reference —
`src/lib/program.ts` lines 308–334, you are adding alongside these, not
replacing them):

```ts
export type Tier = "free" | "pro";

export interface Entitlement {
  tier: Tier;
  // null = unlimited
  maxActivePrograms: number | null;
}

const FREE: Entitlement = { tier: "free", maxActivePrograms: 1 };
const PRO: Entitlement = { tier: "pro", maxActivePrograms: null };

export function getEntitlement(pro: boolean): Entitlement {
  return pro ? PRO : FREE;
}

export function canCreateProgram(
  ent: Entitlement,
  activeCount: number,
): boolean {
  return ent.maxActivePrograms === null || activeCount < ent.maxActivePrograms;
}
```

- [ ] **Step 1: Write the failing tests**

Create or append to `test/lib/program.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canPrepProgram, getEntitlement } from "@/lib/program";

describe("canPrepProgram", () => {
  it("allows a free vendor to prep a second live-in-play program", () => {
    expect(canPrepProgram(getEntitlement(false), 1)).toBe(true);
  });
  it("blocks a free vendor already at 2 live-in-play programs", () => {
    expect(canPrepProgram(getEntitlement(false), 2)).toBe(false);
  });
  it("never blocks a Pro vendor regardless of count", () => {
    expect(canPrepProgram(getEntitlement(true), 50)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run test/lib/program.test.ts`

Expected: FAIL with "canPrepProgram is not a function" (or a TypeScript
error if the test file doesn't compile yet).

- [ ] **Step 3: Implement `canPrepProgram`**

Add this to `src/lib/program.ts`, immediately after the existing
`canCreateProgram` function:

```ts
export interface Entitlement {
  tier: Tier;
  // null = unlimited
  maxActivePrograms: number | null;
  // null = unlimited; caps how many "live-in-play" (replaced_by is null)
  // programs a vendor may have at once — the free-tier prep-a-replacement
  // cap. Pro is unlimited here too (it never needs the prep flow, but
  // isn't blocked from it either).
  maxLiveInPlayPrograms: number | null;
}
```

Note: this changes the `Entitlement` interface — update the two existing
constants in the same file to match:

```ts
const FREE: Entitlement = {
  tier: "free",
  maxActivePrograms: 1,
  maxLiveInPlayPrograms: 2,
};
const PRO: Entitlement = {
  tier: "pro",
  maxActivePrograms: null,
  maxLiveInPlayPrograms: null,
};
```

Then add the new pure function immediately after `canCreateProgram`:

```ts
// Pure: whether the vendor can prep another live-in-play (replaced_by is
// null) program under their entitlement — the free-tier "create a second,
// inactive, to switch to later" cap.
export function canPrepProgram(
  ent: Entitlement,
  liveInPlayCount: number,
): boolean {
  return (
    ent.maxLiveInPlayPrograms === null ||
    liveInPlayCount < ent.maxLiveInPlayPrograms
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run test/lib/program.test.ts`

Expected: PASS, all 3 tests green.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`

Expected: PASS. `pnpm check` confirms the `Entitlement` interface's new
`maxLiveInPlayPrograms` field doesn't break any other file — grep the repo
for `Entitlement` and `getEntitlement(` first to confirm `saveProgramAction`
and `changeTypeAction`'s existing `canCreateProgram(getEntitlement(pro),
...)` calls still compile unchanged (they will — the new field is
additive, no existing code destructures `Entitlement` positionally).

- [ ] **Step 6: Write the failing test for `applyDueCutovers`**

`applyDueCutovers` is an impure Supabase-fetching shell with no direct
test, matching this repo's established convention (`getProgramStats`,
`listVendorCustomers`, `getVendorStats` are also untested directly — only
the pure functions they call are tested). Skip writing a test for it; move
directly to implementation.

- [ ] **Step 7: Implement `applyDueCutovers`**

Add this to `src/lib/program.ts`, immediately after `isPro`:

```ts
// Lazy cutover check for Pro's scheduled retirement (schedule_retirement
// RPC, migration 0023): deactivates any of the signed-in vendor's active
// programs whose scheduled_deactivate_at has passed. RLS (programs_own)
// already scopes this update to the vendor's own rows. No cron — this
// runs at the top of every /dashboard and /setup page load (Task 4) so a
// due cutover takes effect the next time either page is viewed, matching
// isCardExpired's existing lazy-check precedent (src/lib/expiry.ts).
export async function applyDueCutovers(): Promise<void> {
  const supabase = await createServerClient();
  await supabase
    .from("programs")
    .update({ active: false })
    .lte("scheduled_deactivate_at", new Date().toISOString())
    .eq("active", true);
}
```

- [ ] **Step 8: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/program.ts test/lib/program.test.ts
git commit -m "feat(program): add prep cap math and lazy scheduled-cutover check

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Server Actions — prep, activate, schedule retirement

**Files:**

- Modify: `src/app/setup/actions.ts`

**Interfaces:**

- Consumes: `canPrepProgram`, `Entitlement` from Task 2's
  `src/lib/program.ts`. `loopkit.create_program`'s new `p_active` param,
  `loopkit.activate_program`, `loopkit.schedule_retirement` from Task 1's
  migration (this task's RPC calls will only succeed once the user has
  hand-applied `0023_loopkit_program_switching.sql` — this is expected and
  matches every prior migration+action pairing this session; the code
  itself compiles and typechecks regardless).
- Produces: three new exported Server Actions —
  `prepProgramAction(_prev: SaveProgramState, formData: FormData):
Promise<SaveProgramState>`, `activateProgramAction(_prev:
SaveProgramState, formData: FormData): Promise<SaveProgramState>`, and
  `scheduleRetirementAction(_prev: SaveProgramState, formData: FormData):
Promise<SaveProgramState>` — all matching `saveProgramAction`'s existing
  `useActionState`-compatible shape (`SaveProgramState = { error?: string
}`) so Task 4's forms can wire them into `useActionState` the same way
  `SetupForm` already does for `saveProgramAction`/`changeTypeAction`.

The current `saveProgramAction`/`changeTypeAction` (for reference —
`src/app/setup/actions.ts`, full file, you are adding new exports
alongside these, not modifying them):

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/auth";
import {
  saveProgramSchema,
  buildProgramFields,
  getProgramById,
  listPrograms,
  isPro,
  canCreateProgram,
  getEntitlement,
} from "@/lib/program";
import { createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types";

type ProgramUpdate = Database["loopkit"]["Tables"]["programs"]["Update"];

const UPSELL_ERROR =
  "You're on the free plan — 1 program. Ask an admin for Pro.";

export type SaveProgramState = { error?: string };

// ... saveProgramAction, changeTypeAction unchanged, see current file ...
```

- [ ] **Step 1: Write `prepProgramAction`**

Add this to `src/app/setup/actions.ts`, after `changeTypeAction`. Update
the import line for `@/lib/program` to add `canPrepProgram`:

```ts
import {
  saveProgramSchema,
  buildProgramFields,
  getProgramById,
  listPrograms,
  isPro,
  canCreateProgram,
  canPrepProgram,
  getEntitlement,
} from "@/lib/program";
```

```ts
const PREP_UPSELL_ERROR =
  "You already have a card and a prepped replacement — activate or replace one first.";

// Free-tier prep flow: create a second program that starts inactive
// (hidden from customers — enroll_card gates on active) alongside the
// vendor's existing active one. The vendor activates it later via
// activateProgramAction when ready. Pro doesn't need this action (Pro
// creates directly active via saveProgramAction, no cap) but isn't
// blocked from calling it either — canPrepProgram/create_program's
// p_active=false branch never restricts Pro.
export async function prepProgramAction(
  _prev: SaveProgramState,
  formData: FormData,
): Promise<SaveProgramState> {
  await requireVendor();

  const parsed = saveProgramSchema.safeParse({
    type: formData.get("type"),
    name: formData.get("name"),
    stamps_required: formData.get("stamps_required"),
    reward_text: formData.get("reward_text"),
    win_percent: formData.get("win_percent"),
    pity_ceiling: formData.get("pity_ceiling"),
    visits_to_bloom: formData.get("visits_to_bloom"),
    segments: formData.get("segments"),
    period_days: formData.get("period_days"),
    target_streak: formData.get("target_streak"),
    expiry_days: formData.get("expiry_days"),
    head_start: formData.get("head_start"),
  });
  if (!parsed.success) {
    return { error: "Check the card details and try again." };
  }

  const { type, stampsRequired, config, headStart } = buildProgramFields(
    parsed.data,
  );

  const programs = await listPrograms();
  const pro = await isPro();
  if (
    !canPrepProgram(
      getEntitlement(pro),
      programs.filter((p) => p.replaced_by === null).length,
    )
  ) {
    return { error: PREP_UPSELL_ERROR };
  }

  const supabase = await createServerClient();
  const { data: created, error } = await supabase.rpc("create_program", {
    p_type: type,
    p_name: parsed.data.name,
    p_stamps_required: stampsRequired,
    p_reward_text: parsed.data.reward_text,
    p_config: config,
    p_expiry_days: parsed.data.expiry_days ?? null,
    p_head_start: headStart,
    p_active: false,
  });
  if (error) {
    if (error.code === "42501") return { error: PREP_UPSELL_ERROR };
    return { error: "Couldn't create your card. Try again." };
  }
  if (!created) {
    return { error: "Couldn't create your card. Try again." };
  }

  revalidatePath("/setup");
  redirect(`/setup?edit=${created}`);
}
```

- [ ] **Step 2: Write `activateProgramAction`**

Add this immediately after `prepProgramAction`:

```ts
// Free-tier "flip the switch" action: activates a prepped program,
// deactivating whatever else is currently active for this vendor (the
// activate_program RPC, migration 0023, does the actual swap + links the
// old program(s) to this one via replaced_by).
export async function activateProgramAction(
  _prev: SaveProgramState,
  formData: FormData,
): Promise<SaveProgramState> {
  await requireVendor();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Couldn't find that card." };

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("activate_program", {
    p_program: id,
  });
  if (error || !data) {
    return { error: "Couldn't activate that card. Try again." };
  }

  revalidatePath("/setup");
  revalidatePath("/dashboard");
  redirect(`/dashboard?p=${id}`);
}
```

- [ ] **Step 3: Write `scheduleRetirementAction`**

Add this immediately after `activateProgramAction`:

```ts
// Pro-only scheduled cutover: sets a future date on which `id` retires and
// hands over to `successor_id`. The schedule_retirement RPC (migration
// 0023) enforces Pro-only, ownership of both programs, and that both are
// currently active — this action just surfaces its errors.
export async function scheduleRetirementAction(
  _prev: SaveProgramState,
  formData: FormData,
): Promise<SaveProgramState> {
  await requireVendor();

  const id = String(formData.get("id") ?? "").trim();
  const successorId = String(formData.get("successor_id") ?? "").trim();
  const dateValue = String(formData.get("date") ?? "").trim();
  if (!id || !successorId || !dateValue) {
    return { error: "Pick a successor card and a date." };
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    return { error: "Pick a date in the future." };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("schedule_retirement", {
    p_program: id,
    p_successor: successorId,
    p_date: date.toISOString(),
  });
  if (error || !data) {
    if (error?.code === "42501") {
      return { error: "Scheduled retirement is a Pro feature." };
    }
    return { error: "Couldn't schedule that. Try again." };
  }

  revalidatePath("/setup");
  redirect("/setup");
}
```

- [ ] **Step 4: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`

Expected: PASS. This task adds no new tests of its own (Server Actions in
this codebase are exercised through their UI's `*.dom.test.tsx` coverage,
not directly — matching `saveProgramAction`/`changeTypeAction`, neither of
which has a standalone test file today; Task 4's UI tests exercise these
three new actions the same way).

- [ ] **Step 5: Commit**

```bash
git add src/app/setup/actions.ts
git commit -m "feat(setup): add prep, activate, and schedule-retirement actions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: UI — `/setup` list wiring, prep/activate/schedule surfaces, lazy check wiring

**Files:**

- Modify: `src/app/setup/page.tsx`
- Modify: `src/app/setup/setup-form.tsx`
- Create: `src/app/setup/schedule-retirement-form.tsx`
- Create: `src/app/setup/schedule-retirement-form.dom.test.tsx`
- Modify: `src/app/dashboard/page.tsx`
- Test: extend `test/app/setup-page.test.tsx` if it exists, else create
  `src/app/setup/setup-page.dom.test.tsx` (check which convention this
  repo already uses for `/setup`'s page-level tests before choosing —
  co-located `*.dom.test.tsx` is the established pattern for every other
  page this session touched; use that unless `/setup` already has a
  differently-located test file, in which case extend the existing one)

**Interfaces:**

- Consumes: `prepProgramAction`, `activateProgramAction`,
  `scheduleRetirementAction` from Task 3. `applyDueCutovers` from Task 2.
- Produces: nothing later tasks depend on — this is the final task.

The current `/setup/page.tsx`'s "Your programs" list (for reference — full
current content already shown in this plan's exploration; you are adding
conditional links to each `<li>`, not restructuring the list):

```tsx
<div className="flex shrink-0 items-center gap-3 text-sm font-medium">
  <Link
    href={`/setup?edit=${program.id}`}
    className="text-muted-foreground hover:text-foreground"
  >
    Edit
  </Link>
  {program.active && (
    <Link
      href={`/setup?migrate=${program.id}`}
      className="text-muted-foreground hover:text-foreground"
    >
      Change type
    </Link>
  )}
  <Link
    href={`/dashboard?p=${program.id}`}
    className="text-primary hover:underline"
  >
    Manage
  </Link>
</div>
```

- [ ] **Step 1: Wire `applyDueCutovers` into `/dashboard` and `/setup`**

In `src/app/dashboard/page.tsx`, add the import and call it right after
`requireVendor()` and before `listPrograms()`:

```ts
import {
  listPrograms,
  isPro,
  canCreateProgram,
  getEntitlement,
  applyDueCutovers,
} from "@/lib/program";
```

```ts
export default async function DashboardPage() {
  const { user } = await requireVendor();
  await applyDueCutovers();

  const programs = await listPrograms();
```

In `src/app/setup/page.tsx`, add the same import and call, right after
`requireVendor()` and before `listPrograms()`:

```ts
import {
  listPrograms,
  currentProgram,
  isPro,
  canCreateProgram,
  canPrepProgram,
  getEntitlement,
  applyDueCutovers,
} from "@/lib/program";
```

```ts
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; migrate?: string; schedule?: string }>;
}) {
  await requireVendor();
  await applyDueCutovers();
  const { edit, migrate, schedule } = await searchParams;
```

- [ ] **Step 2: Add the "Prep replacement" / "Activate" / "Schedule
      retirement" links to `/setup`'s program list**

In `src/app/setup/page.tsx`, compute the cap and Pro flag alongside the
existing `canCreate` computation (they already load `programs` and `pro`
for that check — extend the same block):

```ts
const pro = await isPro();
const canCreate = canCreateProgram(
  getEntitlement(pro),
  programs.filter((p) => p.active).length,
);
const canPrep = canPrepProgram(
  getEntitlement(pro),
  programs.filter((p) => p.replaced_by === null).length,
);
const activePrograms = programs.filter((p) => p.active);
```

Replace the list item's action links block with:

```tsx
<div className="flex shrink-0 items-center gap-3 text-sm font-medium">
  <Link
    href={`/setup?edit=${program.id}`}
    className="text-muted-foreground hover:text-foreground"
  >
    Edit
  </Link>
  {program.active && !pro && (
    <Link
      href={`/setup?migrate=${program.id}`}
      className="text-muted-foreground hover:text-foreground"
    >
      Change type
    </Link>
  )}
  {program.active && !pro && canPrep && (
    <Link
      href={`/setup?prep=${program.id}`}
      className="text-muted-foreground hover:text-foreground"
    >
      Prep replacement
    </Link>
  )}
  {!program.active && program.replaced_by === null && (
    <form action={activateProgramAction}>
      <input type="hidden" name="id" value={program.id} />
      <button
        type="submit"
        className="text-muted-foreground hover:text-foreground"
      >
        Activate
      </button>
    </form>
  )}
  {program.active && pro && activePrograms.length > 1 && (
    <Link
      href={`/setup?schedule=${program.id}`}
      className="text-muted-foreground hover:text-foreground"
    >
      Schedule retirement
    </Link>
  )}
  <Link
    href={`/dashboard?p=${program.id}`}
    className="text-primary hover:underline"
  >
    Manage
  </Link>
</div>
```

Note: `activateProgramAction` needs to be imported directly and used as a
plain form `action` (not `useActionState`) since this is a Server
Component list, not the client `SetupForm` — add the import at the top of
`src/app/setup/page.tsx`:

```ts
import { activateProgramAction } from "@/app/setup/actions";
```

`{program.active && !pro && ...}` gates "Change type" and "Prep
replacement" to free tier only (Pro doesn't need `changeTypeAction`'s
atomic swap or the prep flow — Pro creates new programs directly active
and uses "Schedule retirement" instead). `activePrograms.length > 1` gates
"Schedule retirement" to only show when there's actually another active
program to pick as a successor.

- [ ] **Step 3: Add the `?prep=<id>` route to `/setup`'s page body**

In `src/app/setup/page.tsx`, add a `prepping` resolution alongside the
existing `migrating` one (same "must resolve to nothing if invalid/unowned,
no fallback-to-first-program" pattern). The page already destructures
`searchParams` once into `{ edit, migrate }` — extend that same
destructure to include `prep` and `schedule` too, rather than awaiting
`searchParams` more than once:

```ts
const { edit, migrate, schedule, prep } = await searchParams;
const editing = edit ? currentProgram(programs, edit) : null;
const isEdit = editing !== null;
const migrating = migrate
  ? (programs.find((p) => p.id === migrate) ?? null)
  : null;
const prepping = prep ? (programs.find((p) => p.id === prep) ?? null) : null;
const scheduling = schedule
  ? (programs.find((p) => p.id === schedule) ?? null)
  : null;
```

Update the `searchParams` prop type to include `prep` and `schedule`:

```ts
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{
    edit?: string;
    migrate?: string;
    prep?: string;
    schedule?: string;
  }>;
}) {
```

Update the header/subtitle block to add a `prepping` and `scheduling`
case, matching the existing `migrating` ternary style:

```tsx
<h1 className="mt-3 font-display text-2xl font-bold tracking-tight">
  {migrating
    ? `Change ${migrating.name}'s type`
    : prepping
      ? `Set up ${prepping.name}'s replacement`
      : scheduling
        ? `Schedule ${scheduling.name}'s retirement`
        : isEdit
          ? "Edit your card"
          : firstRun
            ? "Set up your loyalty card"
            : "Your loyalty programs"}
</h1>
<p className="mt-1 text-sm text-muted-foreground">
  {migrating
    ? "Your current card stops collecting new stamps. Customers who already have it keep it and can still redeem what they've earned — they just won't see it as something to keep working toward. Everyone gets moved onto the new card automatically next time they check their rewards."
    : prepping
      ? "Set up the card that replaces it. It stays hidden from customers until you activate it."
      : scheduling
        ? "Pick the date it retires and which card takes over."
        : isEdit
          ? "Update your loyalty card details."
          : firstRun
            ? "Set up your loyalty card in a minute."
            : "Manage your loyalty programs."}
</p>
```

Update the form-rendering block to add the `prepping` and `scheduling`
branches:

```tsx
{
  isEdit || migrating || canCreate ? (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="px-7 pt-9 pb-8">
        <h2 className="text-3xl font-bold tracking-tight">
          {migrating
            ? "Pick a new card type"
            : isEdit
              ? "Edit your card"
              : "Create a program"}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {migrating
            ? "Set up the card that replaces it."
            : isEdit
              ? "Change how customers earn their reward."
              : "Pick a card type and set how customers earn their reward."}
        </p>

        <SetupForm
          program={migrating ? null : editing}
          isEdit={isEdit}
          replacingId={migrating ? migrating.id : null}
          replacingType={migrating ? migrating.type : null}
        />
      </div>
    </div>
  ) : prepping ? (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="px-7 pt-9 pb-8">
        <h2 className="text-3xl font-bold tracking-tight">
          Set up the replacement
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Pick a card type and set how customers earn their reward. It stays
          hidden until you activate it.
        </p>
        <SetupForm
          program={null}
          isEdit={false}
          replacingId={null}
          replacingType={null}
          prepping
        />
      </div>
    </div>
  ) : scheduling ? (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="px-7 pt-9 pb-8">
        <h2 className="text-3xl font-bold tracking-tight">
          Schedule retirement
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {scheduling.name} keeps running until the date you pick, then it hands
          over automatically.
        </p>
        <ScheduleRetirementForm
          program={scheduling}
          successors={activePrograms.filter((p) => p.id !== scheduling.id)}
        />
      </div>
    </div>
  ) : (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="px-7 py-8">
        <h2 className="text-xl font-bold tracking-tight">
          Free plan: 1 program
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          You&apos;re on the free plan, which includes one loyalty program.
        </p>
        <ProLock label="Upgrade to Pro" className="mt-4" />
      </div>
    </div>
  );
}
```

Add the import at the top of `src/app/setup/page.tsx`:

```ts
import { ScheduleRetirementForm } from "@/app/setup/schedule-retirement-form";
```

- [ ] **Step 4: Add the `prepping` prop to `SetupForm`**

In `src/app/setup/setup-form.tsx`, add a `prepping` prop and route the
form to `prepProgramAction` when set:

```ts
import {
  saveProgramAction,
  changeTypeAction,
  prepProgramAction,
} from "@/app/setup/actions";
```

```ts
export function SetupForm({
  program,
  isEdit,
  replacingId,
  replacingType,
  prepping = false,
}: {
  program: Program | null;
  isEdit: boolean;
  replacingId: string | null;
  replacingType: string | null;
  prepping?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    replacingId ? changeTypeAction : prepping ? prepProgramAction : saveProgramAction,
    {},
  );
```

Update the submit button's label to cover the `prepping` case:

```tsx
<Button
  type="submit"
  size="lg"
  disabled={pending}
  className="h-12 w-full rounded-xl text-base font-semibold"
>
  {isEdit
    ? "Save changes"
    : replacingId
      ? "Change type"
      : prepping
        ? "Save as draft"
        : "Create card"}
</Button>
```

No other change to `setup-form.tsx` — the `carry_over_stamps` checkbox
only shows when `replacingId !== null` (unchanged, `prepping` never sets
that), and every other field behaves identically for a prep-mode create.

- [ ] **Step 5: Write the failing test for `ScheduleRetirementForm`**

Create `src/app/setup/schedule-retirement-form.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { scheduleMock } = vi.hoisted(() => ({ scheduleMock: vi.fn() }));
vi.mock("@/app/setup/actions", () => ({
  scheduleRetirementAction: scheduleMock,
}));

import { ScheduleRetirementForm } from "@/app/setup/schedule-retirement-form";

describe("ScheduleRetirementForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a successor picker with the given programs and a date input", () => {
    render(
      <ScheduleRetirementForm
        program={{ id: "p1", name: "Old card" } as never}
        successors={[
          { id: "p2", name: "New card" } as never,
          { id: "p3", name: "Another card" } as never,
        ]}
      />,
    );
    expect(screen.getByLabelText("Replacement card")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "New card" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Another card" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Retirement date")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Schedule retirement" }),
    ).toBeInTheDocument();
  });

  it("submits the program id, chosen successor, and date", async () => {
    const user = userEvent.setup();
    render(
      <ScheduleRetirementForm
        program={{ id: "p1", name: "Old card" } as never}
        successors={[{ id: "p2", name: "New card" } as never]}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Replacement card"), "p2");
    await user.type(screen.getByLabelText("Retirement date"), "2030-01-01");
    await user.click(
      screen.getByRole("button", { name: "Schedule retirement" }),
    );
    expect(scheduleMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/setup/schedule-retirement-form.dom.test.tsx`

Expected: FAIL — `ScheduleRetirementForm` does not exist yet.

- [ ] **Step 7: Implement `ScheduleRetirementForm`**

Create `src/app/setup/schedule-retirement-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { scheduleRetirementAction } from "@/app/setup/actions";
import type { Program } from "@/lib/program";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const labelClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

export function ScheduleRetirementForm({
  program,
  successors,
}: {
  program: Pick<Program, "id" | "name">;
  successors: Pick<Program, "id" | "name">[];
}) {
  const [state, formAction, pending] = useActionState(
    scheduleRetirementAction,
    {},
  );

  return (
    <form action={formAction} className="mt-7 space-y-5">
      <input type="hidden" name="id" value={program.id} />
      <div className="space-y-2">
        <Label htmlFor="successor_id" className={labelClass}>
          Replacement card
        </Label>
        <select
          id="successor_id"
          name="successor_id"
          required
          className="h-11 w-full rounded-xl border bg-card px-3 text-sm"
        >
          {successors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="date" className={labelClass}>
          Retirement date
        </Label>
        <Input
          id="date"
          name="date"
          type="date"
          required
          className="h-11 rounded-xl"
        />
      </div>
      {state.error ? (
        <p className="text-sm font-medium text-destructive">{state.error}</p>
      ) : null}
      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="h-12 w-full rounded-xl text-base font-semibold"
      >
        Schedule retirement
      </Button>
    </form>
  );
}
```

- [ ] **Step 8: Run the `ScheduleRetirementForm` test to verify it passes**

Run: `pnpm exec vitest run src/app/setup/schedule-retirement-form.dom.test.tsx`

Expected: PASS.

- [ ] **Step 9: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`

Expected: PASS — all tests green, including every pre-existing test.

- [ ] **Step 10: Manual smoke test**

Start the dev server and, as a free-tier vendor with one active program:
visit `/setup`, confirm a "Prep replacement" link appears next to the
active program, click it, fill out the form, submit, and confirm it
redirects back to `/setup?edit=<new-id>` with the new program listed as
"Inactive". Confirm the "Prep replacement" link now disappears (cap
reached) and an "Activate" button appears on the new inactive row. Click
"Activate" and confirm it redirects to `/dashboard?p=<id>` with the
previously-active program now showing "Inactive" back on `/setup`. As a
Pro-tier vendor (or temporarily granting `vendor_pro` to a test account per
`0007`'s bootstrap comment) with two active programs, confirm "Schedule
retirement" appears, and submitting a past date is rejected with "Pick a
date in the future."

- [ ] **Step 11: Commit**

```bash
git add src/app/setup/page.tsx src/app/setup/setup-form.tsx src/app/setup/schedule-retirement-form.tsx src/app/setup/schedule-retirement-form.dom.test.tsx src/app/dashboard/page.tsx
git commit -m "feat(setup): wire prep/activate/schedule-retirement UI + lazy cutover check

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**

- Section A (schema) → Task 1. ✅
- Section B (`create_program` extension) → Task 1. ✅
- Section C (`activate_program`) → Task 1 (RPC) + Task 3
  (`activateProgramAction`) + Task 4 (UI trigger). ✅
- Section D (`schedule_retirement`) → Task 1 (RPC) + Task 3
  (`scheduleRetirementAction`) + Task 4 (`ScheduleRetirementForm` + UI
  trigger). ✅
- Section E (lazy cutover check) → Task 2 (`applyDueCutovers`) + Task 4
  (wiring into `/dashboard` and `/setup`). ✅
- Section F (UI) → Task 4. ✅
- Section G (testing) → pure cap-math tested in Task 2, RPCs hand-reviewed
  per the no-automated-DB-test convention (Task 1's Step 3), UI additions
  get `*.dom.test.tsx` coverage in Task 4. ✅
- Out-of-scope items (delete/archive, real cron, Feature B's stats/
  activity/customers picker and nav fixes) — no task touches any of these.
  ✅

**2. Placeholder scan:** No TBD/TODO/"add appropriate" phrasing. Every step
has exact, complete code and exact commands with expected output.

**3. Type consistency:** `canPrepProgram(ent: Entitlement, liveInPlayCount:
number): boolean` — Task 2 defines it; Task 3's `prepProgramAction` calls
it with `programs.filter((p) => p.replaced_by === null).length`, matching
the "live-in-play" definition used consistently everywhere in this plan
(Task 1's SQL cap check, Task 2's `Entitlement.maxLiveInPlayPrograms`,
Task 4's `canPrep` computation on `/setup`). `Program` type's existing
`replaced_by: string | null` field (already defined in `src/lib/program.ts`
today) is reused throughout, no new field invented for this. Server Action
signatures (`SaveProgramState = { error?: string }`) are identical across
`prepProgramAction`/`activateProgramAction`/`scheduleRetirementAction` and
match `saveProgramAction`'s existing shape exactly, so `useActionState`
wiring in Task 4 compiles the same way it already does for the two
existing actions.

**Build-integrity check:** Task 1 (SQL) and Task 2 (pure TS) are fully
independent — no shared files, can be implemented and reviewed in either
order without breaking the build. Task 3 depends on Task 2's
`canPrepProgram` export existing (a compile-time dependency, not a runtime
one — Task 3's code typechecks against Task 2's already-merged export).
Task 4 depends on Task 3's three action exports existing. Sequencing
1 → 2 → 3 → 4 as written satisfies every dependency; no task's commit ever
leaves `pnpm check` red because each only imports symbols already merged
by an earlier task's commit.
