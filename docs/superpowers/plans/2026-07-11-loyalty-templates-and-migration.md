# Loyalty templates + program type migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let vendors pick a curated template at setup instead of a raw
engine type, and let them later "change type" on an existing program by
retiring it (customers keep their card, redeemable, until the vendor's new
one takes over) — without ever mutating a program's `type` in place.

**Architecture:** One additive schema change (`programs.replaced_by`) plus
a fix to `create_program`'s plan-cap count (active programs only, not
"ever created") and an extension of `vendor_join`'s projection (surface
the replacement's name). Templates are a static prefill catalog, not a new
persisted concept. Migration is deactivate-old → create-new → link, reusing
the existing `create_program` RPC and a shared config-building helper
extracted from `saveProgramAction` — never a new RPC, never an in-place
`type` mutation.

**Tech Stack:** Next.js 16 App Router, Supabase `@supabase/ssr`, Zod,
Vitest, this repo's existing regex-on-migration-text schema test
convention.

## Global Constraints

- A program's `type` is immutable after creation — migration always works
  by deactivating the old program row and creating a new one, never by
  updating `type` on an existing row.
- `cards`/`stamp_events` schema, all engine `Strategy` code
  (`src/lib/engine/*`), and the `enroll_card`/`record_visit`/`redeem`/
  `regenerate_card` RPCs are untouched.
- The vendor-level join QR (`/c?v=<vendor_id>`) and
  `vendor_active_programs` RPC are untouched — no per-program join QR, no
  separate customer-stamping QR system.
- The dashboard's Counter/Customers/Activity/Stats pages keep their
  existing `?p=` program scoping unchanged.
- No DB-backed template catalog and no `template_key` persisted on
  `programs` — a template only prefills form fields; nothing about "which
  template" is ever stored.
- No transactional/saga rollback for the deactivate→create→link sequence —
  consistent with this codebase's existing non-transactional RPC-sequencing
  pattern. A failure between steps is recoverable by retrying from
  `/setup`, never data-destructive.

---

### Task 1: Schema — `replaced_by` column, plan-cap fix, `vendor_join` extension

**Files:**

- Create: `supabase/migrations/0016_loopkit_program_replacement.sql`
- Create: `test/db/program-replacement-schema.test.ts`
- Modify: `src/lib/types.ts` (`vendor_join`'s `Returns` entry, ~line 269-288)
- Modify: `src/lib/program.ts` (`Program` type at line 11-21,
  `PROGRAM_COLUMNS` at line 8-9)

**Interfaces:**

- Produces: `programs.replaced_by` column (`uuid | null`); `vendor_join`'s
  RPC gains a `replaced_by_name: string | null` returned column; `Program`
  gains `replaced_by: string | null`. Task 7 consumes
  `replaced_by_name`; Task 6 consumes `Program.replaced_by` (to show an
  Active/Inactive badge and know which programs are eligible to migrate
  from).
- Consumes: nothing new — extends `loopkit.programs`, `create_program`,
  and `vendor_join`, all already defined in
  `supabase/migrations/0001_loopkit_core.sql`,
  `0008_loopkit_hardening.sql`/`0012_loopkit_card_lifecycle.sql`/
  `0014_loopkit_head_start.sql` (latest `create_program`), and
  `0015_loopkit_vendor_join.sql` (latest `vendor_join`).

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/0016_loopkit_program_replacement.sql`:

```sql
alter table loopkit.programs
  add column replaced_by uuid references loopkit.programs(id);

-- Plan cap: free tier is "1 ACTIVE program", not "1 program ever". Without
-- this fix, deactivating a program to migrate its type would permanently
-- use up a free vendor's only program slot — they could never create the
-- replacement. The migration flow (see changeTypeAction) always deactivates
-- the old program before creating the new one, so by the time this count
-- runs, a single-program free vendor is already back to 0 active.
create or replace function loopkit.create_program(
  p_type            text,
  p_name            text,
  p_stamps_required int,
  p_reward_text     text,
  p_config          jsonb,
  p_expiry_days     int default null,
  p_head_start      boolean default false
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
    (vendor_id, type, name, stamps_required, reward_text, config, expiry_days, head_start)
    values (v_uid, p_type, p_name, p_stamps_required, p_reward_text, p_config, p_expiry_days, p_head_start)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function loopkit.create_program(text, text, int, text, jsonb, int, boolean) to authenticated;

-- vendor_join: surface the replacement program's name for a retired card, so
-- the customer's card page can say what to use instead of a bare "retired"
-- notice. Only the projection changes — enrollment/dedup logic is untouched.
-- Postgres cannot CREATE OR REPLACE a function whose RETURNS TABLE column
-- list changes (adding replaced_by_name here counts as one) — it errors
-- "cannot change return type of existing function." Drop it first.
drop function if exists loopkit.vendor_join(uuid, text);
create or replace function loopkit.vendor_join(p_vendor uuid, p_phone text)
returns table (
  program_id uuid, name text, type text, config jsonb, state jsonb,
  stamp_count int, card_token text, reward_text text, stamps_required int,
  expiry_days int, cycle_started_at timestamptz, active boolean,
  replaced_by_name text
)
language plpgsql security definer set search_path = '' as $$
declare v_program record;
begin
  if p_phone !~ '^\+65[3689][0-9]{7}$' then
    raise exception 'invalid phone';
  end if;

  for v_program in
    select p.id from loopkit.programs p
    where p.vendor_id = p_vendor and p.active
      and not exists (
        select 1 from loopkit.cards c
        where c.program_id = p.id and c.phone = p_phone
      )
  loop
    perform loopkit.enroll_card(v_program.id, p_phone);
  end loop;

  return query
    select p.id, p.name, p.type, p.config, coalesce(c.state, '{}'::jsonb),
           coalesce(c.stamp_count, 0), c.card_token, p.reward_text,
           p.stamps_required, p.expiry_days, c.cycle_started_at, p.active,
           r.name
    from loopkit.cards c
    join loopkit.programs p on p.id = c.program_id
    left join loopkit.programs r on r.id = p.replaced_by
    where p.vendor_id = p_vendor and c.phone = p_phone
    order by c.created_at asc;
end;
$$;

grant execute on function loopkit.vendor_join(uuid, text) to anon, authenticated, service_role;
```

- [ ] **Step 2: Write the failing schema test**

Create `test/db/program-replacement-schema.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0016_loopkit_program_replacement.sql",
  "utf8",
);

describe("0016 program replacement", () => {
  it("adds a self-referencing replaced_by column", () => {
    expect(sql).toMatch(
      /alter table loopkit\.programs\s+add column replaced_by uuid references loopkit\.programs\(id\)/i,
    );
  });

  it("gates create_program's plan cap on active programs only", () => {
    expect(sql).toMatch(
      /select count\(\*\) from loopkit\.programs where vendor_id = v_uid and active/i,
    );
  });

  it("keeps create_program's phone-agnostic signature and grant unchanged", () => {
    expect(sql).toMatch(
      /create or replace function loopkit\.create_program\(/i,
    );
    expect(sql).toMatch(
      /grant execute on function loopkit\.create_program\(text, text, int, text, jsonb, int, boolean\) to authenticated/i,
    );
  });

  it("extends vendor_join's projection with replaced_by_name via a left join", () => {
    expect(sql).toMatch(
      /create or replace function loopkit\.vendor_join\(p_vendor uuid, p_phone text\)/i,
    );
    expect(sql).toMatch(/replaced_by_name text/i);
    expect(sql).toMatch(
      /left join loopkit\.programs r on r\.id = p\.replaced_by/i,
    );
    expect(sql).toMatch(
      /stamps_required, p\.expiry_days, c\.cycle_started_at, p\.active,\s*r\.name/i,
    );
  });

  it("keeps vendor_join's phone guard and active-only enrollment fan-out", () => {
    expect(sql).toMatch(/\^\\\+65\[3689\]\[0-9\]\{7\}\$/);
    expect(sql).toMatch(
      /where p\.vendor_id = p_vendor and p\.active\s*\n\s*and not exists/i,
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `pnpm vitest run test/db/program-replacement-schema.test.ts`
Expected: PASS, all 5 tests (this repo's established convention: a
regex-on-file-text test passes as soon as the migration file exists with
matching text — no separate RED phase, matching
`test/db/vendor-join-schema.test.ts`).

- [ ] **Step 4: Update `src/lib/types.ts`**

In the `vendor_join` entry (currently ending `active: boolean; }[];`),
add the new field:

```typescript
vendor_join: {
  Args: {
    p_vendor: string;
    p_phone: string;
  }
  Returns: {
    program_id: string;
    name: string;
    type: string;
    config: Json;
    state: Json;
    stamp_count: number;
    card_token: string;
    reward_text: string;
    stamps_required: number;
    expiry_days: number | null;
    cycle_started_at: string | null;
    active: boolean;
    replaced_by_name: string | null;
  }
  [];
}
```

- [ ] **Step 5: Update `src/lib/program.ts`'s `Program` type and column list**

Change:

```typescript
const PROGRAM_COLUMNS =
  "id,name,stamps_required,reward_text,type,config,active,expiry_days,head_start";

export type Program = {
  id: string;
  name: string;
  stamps_required: number;
  reward_text: string;
  type: string;
  config: unknown;
  active: boolean;
  expiry_days?: number | null;
  head_start: boolean;
};
```

to:

```typescript
const PROGRAM_COLUMNS =
  "id,name,stamps_required,reward_text,type,config,active,expiry_days,head_start,replaced_by";

export type Program = {
  id: string;
  name: string;
  stamps_required: number;
  reward_text: string;
  type: string;
  config: unknown;
  active: boolean;
  expiry_days?: number | null;
  head_start: boolean;
  replaced_by: string | null;
};
```

- [ ] **Step 6: Run typecheck and the full test suite**

Run: `pnpm check && pnpm test`
Expected: PASS. (`Program` gaining a required field is additive at the
type level for every existing caller — none of them construct a `Program`
literal by hand, they all read it back from `listPrograms`/`getProgramById`,
so no other file needs a change yet.)

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0016_loopkit_program_replacement.sql test/db/program-replacement-schema.test.ts src/lib/types.ts src/lib/program.ts
git commit -m "feat: add programs.replaced_by, gate plan cap on active programs, extend vendor_join"
```

---

### Task 2: Plan-cap call sites — count active programs only

**Files:**

- Modify: `src/app/setup/page.tsx:30`
- Modify: `src/app/setup/actions.ts:142`
- Modify: `test/app/save-program-action.test.ts` (fix a latent test gap +
  add a new case)

**Interfaces:**

- Consumes: `canCreateProgram(count: number, pro: boolean): boolean`
  (unchanged, `src/lib/program.ts:231-233`) and `Program.active`
  (Task 1).
- Produces: no new exports — this task only changes what's passed into
  `canCreateProgram` at its two call sites.

- [ ] **Step 1: Fix the existing test that would silently break**

`test/app/save-program-action.test.ts`'s "blocks a free vendor already at
the one-program limit" test mocks `listProgramsMock.mockResolvedValue([{
id: "existing" }])` — no `active` field. Once the call site below filters
on `p.active`, this mock's `active` would be `undefined` (falsy), so the
filtered count would become `0`, and the test would start failing for the
wrong reason (it currently passes only because `programs.length` counts
the mock regardless of `active`). Fix the mock to be explicit, and add a
new case proving the actual fix:

Change:

```typescript
it("blocks a free vendor already at the one-program limit", async () => {
  listProgramsMock.mockResolvedValue([{ id: "existing" }]);
  isProMock.mockResolvedValue(false);

  const res = await saveProgramAction({}, form(stampFields));

  expect(res.error).toMatch(/free plan/i);
  expect(rpcMock).not.toHaveBeenCalled();
});
```

to:

```typescript
it("blocks a free vendor already at the one-program limit", async () => {
  listProgramsMock.mockResolvedValue([{ id: "existing", active: true }]);
  isProMock.mockResolvedValue(false);

  const res = await saveProgramAction({}, form(stampFields));

  expect(res.error).toMatch(/free plan/i);
  expect(rpcMock).not.toHaveBeenCalled();
});

it("lets a free vendor create when their only program is inactive (mid-migration)", async () => {
  listProgramsMock.mockResolvedValue([{ id: "retired", active: false }]);
  isProMock.mockResolvedValue(false);

  await expect(saveProgramAction({}, form(stampFields))).rejects.toThrow(
    "REDIRECT:/dashboard?p=new-id",
  );
  expect(rpcMock).toHaveBeenCalledWith(
    "create_program",
    expect.objectContaining({ p_type: "stamp" }),
  );
});
```

- [ ] **Step 2: Run the tests to verify the new one fails**

Run: `pnpm vitest run test/app/save-program-action.test.ts`
Expected: FAIL on the new "lets a free vendor create when their only
program is inactive" case — `saveProgramAction` still passes
`programs.length` (which is `1` regardless of `active`), so
`canCreateProgram(1, false)` is `false` and the action returns the upsell
error instead of redirecting.

- [ ] **Step 3: Fix the call sites**

In `src/app/setup/actions.ts`, change line 142:

```typescript
  if (!canCreateProgram(programs.length, pro)) {
```

to:

```typescript
  if (!canCreateProgram(programs.filter((p) => p.active).length, pro)) {
```

In `src/app/setup/page.tsx`, change line 30:

```typescript
const canCreate = canCreateProgram(programs.length, pro);
```

to:

```typescript
const canCreate = canCreateProgram(
  programs.filter((p) => p.active).length,
  pro,
);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run test/app/save-program-action.test.ts`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/setup/page.tsx src/app/setup/actions.ts test/app/save-program-action.test.ts
git commit -m "fix: gate the free-tier program cap on active programs, not all-time count"
```

---

### Task 3: Extract `buildProgramFields` — shared type→config logic

**Files:**

- Modify: `src/lib/program.ts` (add `buildProgramFields`)
- Modify: `src/app/setup/actions.ts` (use it in `saveProgramAction`)
- Create: `test/lib/build-program-fields.test.ts`

**Interfaces:**

- Produces: `buildProgramFields(data: SaveProgramInput): { type: string;
stampsRequired: number; config: Json; headStart: boolean }` — exported
  from `src/lib/program.ts`. Task 5's `changeTypeAction` consumes this
  directly (its whole reason for existing: avoid duplicating this if/else
  chain across two server actions).
- Consumes: `SaveProgramInput` (`src/lib/program.ts:124`, already
  exported), `buildPlantConfig`/`buildChanceConfig`/`buildStreakConfig`
  (already in the same file).

- [ ] **Step 1: Write the failing tests**

Create `test/lib/build-program-fields.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildProgramFields, type SaveProgramInput } from "@/lib/program";

describe("buildProgramFields", () => {
  it("builds a stamp program's fields", () => {
    const result = buildProgramFields({
      type: "stamp",
      name: "Coffee card",
      stamps_required: 10,
      reward_text: "Free kopi",
      head_start: true,
      expiry_days: undefined,
    } as SaveProgramInput);

    expect(result).toEqual({
      type: "stamp",
      stampsRequired: 10,
      headStart: true,
      config: { stamps_required: 10, reward_text: "Free kopi" },
    });
  });

  it("builds a lucky program's fields, converting win_percent to a probability", () => {
    const result = buildProgramFields({
      type: "lucky",
      name: "Lucky tap",
      reward_text: "Free item",
      win_percent: 20,
      pity_ceiling: 8,
      expiry_days: undefined,
    } as SaveProgramInput);

    expect(result.type).toBe("lucky");
    expect(result.stampsRequired).toBe(8);
    expect(result.headStart).toBe(false);
    expect(result.config).toMatchObject({
      win_probability: 0.2,
      pity_ceiling: 8,
      cooldown_visits: 0,
    });
  });

  it("builds a plant program's fields via buildPlantConfig", () => {
    const result = buildProgramFields({
      type: "plant",
      name: "Grow-a-kopi",
      reward_text: "Free kopi",
      visits_to_bloom: 6,
      head_start: false,
      expiry_days: undefined,
    } as SaveProgramInput);

    expect(result.type).toBe("plant");
    expect(result.stampsRequired).toBe(6);
    expect(result.config).toMatchObject({ reward_text: "Free kopi" });
  });

  it("builds a streak program's fields via buildStreakConfig", () => {
    const result = buildProgramFields({
      type: "streak",
      name: "Weekly regular",
      reward_text: "Free item",
      period_days: 7,
      target_streak: 4,
      head_start: false,
      expiry_days: undefined,
    } as SaveProgramInput);

    expect(result.type).toBe("streak");
    expect(result.stampsRequired).toBe(4);
    expect(result.config).toMatchObject({ period_days: 7, target_streak: 4 });
  });

  it("builds a wheel/scratch program's fields via buildChanceConfig, defaulting the pity ceiling", () => {
    const result = buildProgramFields({
      type: "wheel",
      name: "Spin to win",
      reward_text: "Free item",
      segments: [
        { label: "Try again", weight: 5, is_reward: false },
        { label: "Free item", weight: 1, is_reward: true },
      ],
      pity_ceiling: undefined,
      expiry_days: undefined,
    } as SaveProgramInput);

    expect(result.type).toBe("wheel");
    expect(result.stampsRequired).toBe(10);
    expect(result.headStart).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run test/lib/build-program-fields.test.ts`
Expected: FAIL with "buildProgramFields is not a function" (or a Vitest
module-resolution error) — the function doesn't exist yet.

- [ ] **Step 3: Add `Json` import and `buildProgramFields` to `src/lib/program.ts`**

Add to the top-of-file imports:

```typescript
import type { Json } from "@/lib/types";
```

Add after `buildStreakConfig` (after line 189, before the `listPrograms`
comment):

```typescript
// Shared by saveProgramAction (create/edit) and changeTypeAction (Section C
// of the templates-and-migration design) — the type-to-{type,
// stampsRequired, config, headStart} mapping is identical in both; this is
// the one place it's implemented.
export function buildProgramFields(data: SaveProgramInput): {
  type: string;
  stampsRequired: number;
  config: Json;
  headStart: boolean;
} {
  if (data.type === "stamp") {
    return {
      type: "stamp",
      stampsRequired: data.stamps_required,
      headStart: data.head_start,
      config: {
        stamps_required: data.stamps_required,
        reward_text: data.reward_text,
      },
    };
  }
  if (data.type === "lucky") {
    return {
      type: "lucky",
      stampsRequired: data.pity_ceiling,
      headStart: false,
      config: {
        win_probability: data.win_percent / 100,
        pity_ceiling: data.pity_ceiling,
        cooldown_visits: 0,
        reward_text: data.reward_text,
      },
    };
  }
  if (data.type === "plant") {
    return {
      type: "plant",
      stampsRequired: data.visits_to_bloom,
      headStart: data.head_start,
      config: buildPlantConfig(data.visits_to_bloom, data.reward_text) as Json,
    };
  }
  if (data.type === "streak") {
    return {
      type: "streak",
      stampsRequired: data.target_streak,
      headStart: data.head_start,
      config: buildStreakConfig(
        data.period_days,
        data.target_streak,
        data.reward_text,
      ) as Json,
    };
  }
  return {
    type: data.type,
    stampsRequired: data.pity_ceiling ?? 10,
    headStart: false,
    config: buildChanceConfig(
      data.type,
      data.segments,
      data.pity_ceiling,
      data.reward_text,
    ) as Json,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run test/lib/build-program-fields.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Use it in `saveProgramAction`**

In `src/app/setup/actions.ts`, replace the whole if/else chain (lines
68-114, from `let type: string;` through the closing `}` before `const
supabase = await createServerClient();`) with:

```typescript
const { type, stampsRequired, config, headStart } = buildProgramFields(data);
```

Add `buildProgramFields` to the `@/lib/program` import list at the top of
the file (alongside `saveProgramSchema`, `buildPlantConfig`, etc.) — and
remove `buildPlantConfig`, `buildChanceConfig`, `buildStreakConfig` from
that import list, since `actions.ts` no longer calls them directly.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: PASS — `test/app/save-program-action.test.ts`'s existing cases
all still pass unchanged, since `buildProgramFields`'s behavior is a
verbatim extraction.

- [ ] **Step 7: Commit**

```bash
git add src/lib/program.ts src/app/setup/actions.ts test/lib/build-program-fields.test.ts
git commit -m "refactor: extract buildProgramFields, shared by saveProgramAction and the upcoming change-type action"
```

---

### Task 4: Template catalog + `ProgramType` relocation

**Files:**

- Create: `src/lib/templates.ts`
- Create: `test/lib/templates.test.ts`
- Modify: `src/lib/program.ts` (export `ProgramType`)
- Modify: `src/app/setup/setup-form.tsx` (import `ProgramType` instead of
  declaring it locally — no behavior change yet; the template-grid UI is
  Task 6)

**Interfaces:**

- Produces: `ProgramType` (exported from `src/lib/program.ts`); `Template`
  type and `TEMPLATES: Template[]` (exported from `src/lib/templates.ts`).
  Task 6 consumes `TEMPLATES` to render the template grid and prefill
  `SetupForm`'s fields.
- Consumes: `saveProgramSchema` (`src/lib/program.ts:60`, to validate each
  template's defaults satisfy its type's branch).

- [ ] **Step 1: Export `ProgramType` from `src/lib/program.ts`**

Add near the top of `src/lib/program.ts`, after the existing imports:

```typescript
export type ProgramType =
  "stamp" | "lucky" | "plant" | "wheel" | "scratch" | "streak";
```

- [ ] **Step 2: Point `setup-form.tsx` at the shared type**

In `src/app/setup/setup-form.tsx`, change:

```typescript
import type { Program } from "@/lib/program";
```

to:

```typescript
import type { Program, ProgramType } from "@/lib/program";
```

and delete the now-redundant local declaration:

```typescript
type ProgramType = "stamp" | "lucky" | "plant" | "wheel" | "scratch" | "streak";
```

- [ ] **Step 3: Run typecheck to confirm no regression**

Run: `npx tsc --noEmit`
Expected: no errors — `ProgramType`'s shape is identical, just relocated.

- [ ] **Step 4: Write the failing template tests**

Create `test/lib/templates.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { TEMPLATES } from "@/lib/templates";
import { saveProgramSchema } from "@/lib/program";

describe("TEMPLATES", () => {
  it("has at least one template per engine type", () => {
    const types = new Set(TEMPLATES.map((t) => t.type));
    expect(types).toEqual(
      new Set(["stamp", "lucky", "plant", "wheel", "scratch", "streak"]),
    );
  });

  it("has unique keys", () => {
    const keys = TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every template's defaults satisfy its type's saveProgramSchema branch", () => {
    for (const template of TEMPLATES) {
      const payload: Record<string, unknown> = {
        type: template.type,
        name: template.defaults.name,
        reward_text: template.defaults.reward_text,
        head_start: "false",
      };
      if (template.type === "stamp") {
        payload.stamps_required = template.defaults.stamps_required;
      }
      if (template.type === "plant") {
        payload.visits_to_bloom = template.defaults.visits_to_bloom;
      }
      if (template.type === "lucky") {
        payload.win_percent = template.defaults.win_percent;
        payload.pity_ceiling = template.defaults.pity_ceiling;
      }
      if (template.type === "streak") {
        payload.period_days = template.defaults.period_days;
        payload.target_streak = template.defaults.target_streak;
      }
      if (template.type === "wheel" || template.type === "scratch") {
        payload.segments = [
          { label: "Try again", weight: 5, is_reward: false },
          { label: "Free item", weight: 1, is_reward: true },
        ];
      }

      const result = saveProgramSchema.safeParse(payload);
      expect(
        result.success,
        `template "${template.key}" failed: ${JSON.stringify(!result.success && result.error.issues)}`,
      ).toBe(true);
    }
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `pnpm vitest run test/lib/templates.test.ts`
Expected: FAIL — `@/lib/templates` doesn't exist yet.

- [ ] **Step 6: Create `src/lib/templates.ts`**

```typescript
import type { ProgramType } from "@/lib/program";

export type Template = {
  key: string;
  label: string;
  description: string;
  type: ProgramType;
  defaults: {
    name: string;
    reward_text: string;
    stamps_required?: number;
    visits_to_bloom?: number;
    win_percent?: number;
    pity_ceiling?: number;
    period_days?: number;
    target_streak?: number;
  };
};

// Curated presets — each just prefills SetupForm's existing fields for a
// given engine type; nothing here is persisted. A vendor can edit any field
// before saving, exactly as if they'd picked the type manually. Every
// template's defaults are validated against saveProgramSchema in
// test/lib/templates.test.ts, so a schema change that breaks a template is
// caught at test time, not at first vendor use.
export const TEMPLATES: Template[] = [
  {
    key: "cafe-regulars",
    label: "Cafe Regulars",
    description: "10 visits, free coffee",
    type: "stamp",
    defaults: {
      name: "Coffee card",
      stamps_required: 10,
      reward_text: "Free coffee",
    },
  },
  {
    key: "bakery-loaf-club",
    label: "Bakery Loaf Club",
    description: "8 visits, free loaf",
    type: "stamp",
    defaults: {
      name: "Loaf club",
      stamps_required: 8,
      reward_text: "Free loaf of bread",
    },
  },
  {
    key: "salon-vip",
    label: "Salon VIP",
    description: "6 visits, free treatment",
    type: "stamp",
    defaults: {
      name: "Salon VIP card",
      stamps_required: 6,
      reward_text: "Free treatment",
    },
  },
  {
    key: "weekly-regular",
    label: "Weekly Regular",
    description: "Visit weekly, reward after a 4-week streak",
    type: "streak",
    defaults: {
      name: "Weekly regular",
      period_days: 7,
      target_streak: 4,
      reward_text: "Free item",
    },
  },
  {
    key: "grow-a-kopi",
    label: "Grow-a-Kopi",
    description: "6 visits to bloom",
    type: "plant",
    defaults: {
      name: "Grow-a-kopi",
      visits_to_bloom: 6,
      reward_text: "Free kopi",
    },
  },
  {
    key: "lucky-tap",
    label: "Lucky Tap",
    description: "20% win chance every visit",
    type: "lucky",
    defaults: {
      name: "Lucky tap",
      win_percent: 20,
      pity_ceiling: 8,
      reward_text: "Free item",
    },
  },
  {
    key: "spin-the-wheel",
    label: "Spin the Wheel",
    description: "Spin for a prize on every visit",
    type: "wheel",
    defaults: { name: "Spin to win", reward_text: "Free item" },
  },
  {
    key: "scratch-and-win",
    label: "Scratch & Win",
    description: "Scratch for a prize on every visit",
    type: "scratch",
    defaults: { name: "Scratch & win", reward_text: "Free item" },
  },
];
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm vitest run test/lib/templates.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 8: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/program.ts src/lib/templates.ts src/app/setup/setup-form.tsx test/lib/templates.test.ts
git commit -m "feat: add curated loyalty templates catalog"
```

---

### Task 5: `changeTypeAction` — deactivate old, create new, link

**Files:**

- Modify: `src/app/setup/actions.ts` (add `changeTypeAction`)
- Create: `test/app/change-type-action.test.ts`

**Interfaces:**

- Consumes: `buildProgramFields` (Task 3), `getProgramById`
  (`src/lib/program.ts:206-215`), `saveProgramSchema`
  (`src/lib/program.ts:60`), `create_program` RPC (unchanged signature;
  its plan-cap gate was fixed in Task 1).
- Produces: `changeTypeAction(prev: SaveProgramState, formData: FormData):
Promise<SaveProgramState>` — Task 6's migrate-mode `SetupForm` submits
  to this instead of `saveProgramAction`.

No pre-check of `canCreateProgram` is needed in this action: it always
deactivates the old program (Step 1, below) before creating the new one
(Step 2), so by the time `create_program`'s DB-side gate runs, a
single-program free vendor's active count is already back to `0` — the
free-tier cap can never actually trigger in this flow. This is why the
step order matters and must not be swapped.

- [ ] **Step 1: Write the failing tests**

Create `test/app/change-type-action.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getProgramByIdMock, rpcMock } = vi.hoisted(() => ({
  getProgramByIdMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireVendor: vi.fn(async () => ({ user: { id: "v1" } })),
}));

vi.mock("@/lib/program", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/program")>();
  return {
    ...actual,
    getProgramById: getProgramByIdMock,
  };
});

const updateCalls: Array<{ table: string; values: unknown; eqId: string }> = [];
const fromMock = vi.fn((table: string) => ({
  update: (values: unknown) => ({
    eq: async (_col: string, id: string) => {
      updateCalls.push({ table, values, eqId: id });
      return { error: null };
    },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ from: fromMock, rpc: rpcMock })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { changeTypeAction } from "@/app/setup/actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const stampFields = {
  replacing: "old-id",
  type: "stamp",
  name: "New coffee card",
  stamps_required: "10",
  reward_text: "Free kopi",
  head_start: "false",
};

describe("changeTypeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateCalls.length = 0;
    getProgramByIdMock.mockResolvedValue({ id: "old-id", type: "wheel" });
    rpcMock.mockResolvedValue({ data: "new-id", error: null });
  });

  it("rejects an unknown or unowned replacing id without any writes", async () => {
    getProgramByIdMock.mockResolvedValue(null);

    const res = await changeTypeAction({}, form(stampFields));

    expect(res.error).toBeTruthy();
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("deactivates the old program, then creates the new one, then links them, in order", async () => {
    await expect(changeTypeAction({}, form(stampFields))).rejects.toThrow(
      "REDIRECT:/dashboard?p=new-id",
    );

    expect(updateCalls[0]).toMatchObject({
      values: { active: false },
      eqId: "old-id",
    });
    expect(rpcMock).toHaveBeenCalledWith(
      "create_program",
      expect.objectContaining({ p_type: "stamp", p_name: "New coffee card" }),
    );
    expect(updateCalls[1]).toMatchObject({
      values: { replaced_by: "new-id" },
      eqId: "old-id",
    });
  });

  it("leaves the old program deactivated and returns an error if create_program fails, without linking", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    const res = await changeTypeAction({}, form(stampFields));

    expect(res.error).toBeTruthy();
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({ values: { active: false } });
  });

  it("still redirects successfully even if the final link update fails", async () => {
    fromMock.mockImplementation((table: string) => ({
      update: (values: unknown) => ({
        eq: async (_col: string, id: string) => {
          updateCalls.push({ table, values, eqId: id });
          if ("replaced_by" in (values as object)) {
            return { error: { message: "link failed" } };
          }
          return { error: null };
        },
      }),
    }));

    await expect(changeTypeAction({}, form(stampFields))).rejects.toThrow(
      "REDIRECT:/dashboard?p=new-id",
    );
  });

  it("rejects invalid config input without any writes", async () => {
    const res = await changeTypeAction({}, form({ ...stampFields, name: "" }));

    expect(res.error).toBeTruthy();
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run test/app/change-type-action.test.ts`
Expected: FAIL — `changeTypeAction` doesn't exist yet.

- [ ] **Step 3: Add `changeTypeAction` to `src/app/setup/actions.ts`**

Add `buildProgramFields` to the `@/lib/program` import list (it's already
being added there in Task 3's Step 5 — confirm it's present, don't
duplicate the import line). Then append at the end of the file:

```typescript
// Vendor-initiated "change type" flow (templates-and-migration design,
// Section C): a program's type is immutable in place (see the comment on
// saveProgramAction above), so migrating means retiring the old program and
// creating a fresh one — never mutating `type` on an existing row.
//
// Order matters: the old program is deactivated BEFORE the new one is
// created. create_program's plan-cap gate counts only active programs
// (migration 0016), so deactivating first is what lets a free-tier vendor's
// single active program be replaced without ever needing a Pro upsell.
export async function changeTypeAction(
  _prev: SaveProgramState,
  formData: FormData,
): Promise<SaveProgramState> {
  await requireVendor();

  const replacingId = String(formData.get("replacing") ?? "").trim();
  const existing = replacingId ? await getProgramById(replacingId) : null;
  if (!existing) return { error: "Couldn't find that card." };

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

  const supabase = await createServerClient();

  // 1. Deactivate the old program first (see order note above).
  const { error: deactivateError } = await supabase
    .from("programs")
    .update({ active: false })
    .eq("id", replacingId);
  if (deactivateError) {
    return { error: "Couldn't change your card. Try again." };
  }

  // 2. Create the new program.
  const { data: created, error: createError } = await supabase.rpc(
    "create_program",
    {
      p_type: type,
      p_name: parsed.data.name,
      p_stamps_required: stampsRequired,
      p_reward_text: parsed.data.reward_text,
      p_config: config,
      p_expiry_days: parsed.data.expiry_days ?? null,
      p_head_start: headStart,
    },
  );
  if (createError || !created) {
    // Old program is already deactivated with no replacement yet — not data
    // loss. The vendor can retry from /setup; the free-tier gate is open
    // again (active count is back to 0). No saga/rollback machinery, matching
    // this codebase's existing non-transactional RPC-sequencing pattern.
    return { error: "Couldn't create the new card. Try again from Setup." };
  }

  // 3. Link old -> new so vendor_join can tell affected customers. Best
  // effort: a failure here just means the retired card shows the generic
  // message (program-card-status.tsx) instead of naming the replacement —
  // cosmetic, not blocking.
  await supabase
    .from("programs")
    .update({ replaced_by: created })
    .eq("id", replacingId);

  revalidatePath("/setup");
  redirect(`/dashboard?p=${created}`);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run test/app/change-type-action.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/setup/actions.ts test/app/change-type-action.test.ts
git commit -m "feat: add changeTypeAction (deactivate, create, link)"
```

---

### Task 6: `/setup` UI — status badges, "Change type" entry point, migrate flow

**Files:**

- Modify: `src/app/setup/setup-form.tsx` (template grid + `replacingId` prop)
- Modify: `src/app/setup/page.tsx` (badges, "Change type" link, migrate mode)

**Interfaces:**

- Consumes: `TEMPLATES` (Task 4), `changeTypeAction` (Task 5),
  `Program.active`/`Program.replaced_by` (Task 1).
- Produces: `<SetupForm program={Program | null} isEdit={boolean}
replacingId={string | null} />` — the `replacingId` prop is new; every
  existing call site (`/setup/page.tsx`'s current two render paths) must
  pass it explicitly (`null` where not migrating) since it's not optional
  on the destructured parameter list below.

- [ ] **Step 1: Rewrite `src/app/setup/setup-form.tsx`**

Uncontrolled `<Input defaultValue>` elements (this file's existing pattern
for every type-specific field) don't update on re-render — only on
remount. So picking a template needs two pieces of state: which template
(if any) is selected, and a `key` on each prefillable input that changes
when the selection changes, forcing React to remount it with a fresh
`defaultValue`. `prefill` is derived from `selectedTemplateKey` rather
than stored separately, so there's exactly one source of truth for "what
did the vendor pick."

Full replacement:

```tsx
"use client";

import { useActionState, useState } from "react";
import { saveProgramAction, changeTypeAction } from "@/app/setup/actions";
import type { Program, ProgramType } from "@/lib/program";
import { TEMPLATES } from "@/lib/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type SegmentInput = { label: string; weight: number; is_reward: boolean };

const labelClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

const typeLabels: Record<ProgramType, string> = {
  stamp: "Stamp card",
  lucky: "Lucky Tap",
  plant: "Sprout",
  wheel: "Spin the Wheel",
  scratch: "Scratch Card",
  streak: "Streak Club",
};

const DEFAULT_SEGMENTS: SegmentInput[] = [
  { label: "Try again", weight: 5, is_reward: false },
  { label: "Free item", weight: 1, is_reward: true },
];

export function SetupForm({
  program,
  isEdit,
  replacingId,
}: {
  program: Program | null;
  isEdit: boolean;
  replacingId: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    replacingId ? changeTypeAction : saveProgramAction,
    {},
  );
  const initialType: ProgramType =
    program?.type === "lucky" ||
    program?.type === "plant" ||
    program?.type === "wheel" ||
    program?.type === "scratch" ||
    program?.type === "streak"
      ? program.type
      : "stamp";
  const [type, setType] = useState<ProgramType>(initialType);
  // "template" shows the curated grid (the default for both plain create and
  // migrate flows); "custom" falls back to today's raw type grid. Only
  // meaningful when !isEdit — isEdit always shows the locked static label.
  const [pickerMode, setPickerMode] = useState<"template" | "custom">(
    "template",
  );
  // Which template tile is selected, or null (custom mode, or no pick yet).
  // prefill is derived from this — never stored separately — so there's one
  // source of truth for "what did the vendor pick."
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(
    null,
  );
  const prefill = TEMPLATES.find(
    (t) => t.key === selectedTemplateKey,
  )?.defaults;
  // Changes whenever the template selection changes (including to/from
  // "custom") — keying prefillable inputs on this forces them to remount
  // with a fresh defaultValue, since they're uncontrolled.
  const prefillGeneration = selectedTemplateKey ?? "custom";

  const config = (program?.config ?? {}) as {
    win_probability?: number;
    pity_ceiling?: number;
    reward_text?: string;
    stages?: { threshold: number }[];
    segments?: { label: string; weight: number; reward_text?: string }[];
    period_days?: number;
    target_streak?: number;
  };
  const visitsToBloom =
    prefill?.visits_to_bloom ??
    config.stages?.[config.stages.length - 1]?.threshold ??
    6;
  const [segments, setSegments] = useState<SegmentInput[]>(
    config.segments?.map((s) => ({
      label: s.label,
      weight: s.weight,
      is_reward: !!s.reward_text,
    })) ?? DEFAULT_SEGMENTS,
  );
  const [headStart, setHeadStart] = useState(program?.head_start ?? false);

  function pickTemplate(template: (typeof TEMPLATES)[number]) {
    setType(template.type);
    setSelectedTemplateKey(template.key);
  }

  function pickCustomType(value: ProgramType) {
    setType(value);
    setSelectedTemplateKey(null);
  }

  function updateSegment(index: number, patch: Partial<SegmentInput>) {
    setSegments((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  }

  function addSegment() {
    setSegments((prev) => [
      ...prev,
      { label: "New prize", weight: 1, is_reward: false },
    ]);
  }

  function removeSegment(index: number) {
    setSegments((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <form action={formAction} className="mt-7 space-y-5">
      {program ? <input type="hidden" name="id" value={program.id} /> : null}
      {replacingId ? (
        <input type="hidden" name="replacing" value={replacingId} />
      ) : null}
      <div className="space-y-2">
        <Label className={labelClass}>Card type</Label>
        {isEdit ? (
          <p className="flex h-11 items-center rounded-xl border bg-muted/40 px-3 text-sm font-semibold text-muted-foreground">
            {typeLabels[type]}
          </p>
        ) : (
          <div className="space-y-3">
            {pickerMode === "template" ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {TEMPLATES.map((template) => (
                    <button
                      key={template.key}
                      type="button"
                      onClick={() => pickTemplate(template)}
                      className={cn(
                        "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors",
                        selectedTemplateKey === template.key
                          ? "border-primary bg-primary/10"
                          : "bg-card hover:bg-muted/50",
                      )}
                    >
                      <span className="text-sm font-semibold">
                        {template.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {template.description}
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPickerMode("custom");
                    setSelectedTemplateKey(null);
                  }}
                  className="h-11 w-full rounded-xl border text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/50"
                >
                  Custom — start from scratch
                </button>
              </>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { value: "stamp", label: "Stamp card" },
                    { value: "lucky", label: "Lucky Tap" },
                    { value: "plant", label: "Sprout" },
                    { value: "wheel", label: "Spin the Wheel" },
                    { value: "scratch", label: "Scratch Card" },
                    { value: "streak", label: "Streak Club" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => pickCustomType(option.value)}
                    className={cn(
                      "h-11 rounded-xl border text-sm font-semibold transition-colors",
                      type === option.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "bg-card text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <input type="hidden" name="type" value={type} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="name" className={labelClass}>
          Card name
        </Label>
        <Input
          key={`name-${prefillGeneration}`}
          id="name"
          name="name"
          type="text"
          required
          maxLength={60}
          placeholder={
            type === "lucky"
              ? "Lucky topping"
              : type === "plant"
                ? "Grow-a-kopi"
                : type === "wheel"
                  ? "Spin to win"
                  : type === "scratch"
                    ? "Scratch & win"
                    : type === "streak"
                      ? "Weekly regular"
                      : "Coffee card"
          }
          defaultValue={prefill?.name ?? program?.name ?? ""}
          className="h-11 rounded-xl"
        />
      </div>

      {type === "stamp" ? (
        <div className="space-y-2">
          <Label htmlFor="stamps_required" className={labelClass}>
            Stamps required
          </Label>
          <Input
            key={`stamps_required-${prefillGeneration}`}
            id="stamps_required"
            name="stamps_required"
            type="number"
            required
            min={2}
            max={20}
            placeholder="10"
            defaultValue={
              prefill?.stamps_required ?? program?.stamps_required ?? 10
            }
            className="h-11 rounded-xl"
          />
        </div>
      ) : type === "plant" ? (
        <div className="space-y-2">
          <Label htmlFor="visits_to_bloom" className={labelClass}>
            Visits to bloom
          </Label>
          <Input
            key={`visits_to_bloom-${prefillGeneration}`}
            id="visits_to_bloom"
            name="visits_to_bloom"
            type="number"
            required
            min={4}
            max={20}
            placeholder="6"
            defaultValue={visitsToBloom}
            className="h-11 rounded-xl"
          />
        </div>
      ) : type === "streak" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="period_days" className={labelClass}>
              Days per streak window
            </Label>
            <Input
              key={`period_days-${prefillGeneration}`}
              id="period_days"
              name="period_days"
              type="number"
              required
              min={1}
              max={30}
              placeholder="7"
              defaultValue={prefill?.period_days ?? config.period_days ?? 7}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="target_streak" className={labelClass}>
              Streak length to earn reward
            </Label>
            <Input
              key={`target_streak-${prefillGeneration}`}
              id="target_streak"
              name="target_streak"
              type="number"
              required
              min={2}
              max={20}
              placeholder="4"
              defaultValue={prefill?.target_streak ?? config.target_streak ?? 4}
              className="h-11 rounded-xl"
            />
          </div>
        </>
      ) : type === "wheel" || type === "scratch" ? (
        <>
          <div className="space-y-2">
            <Label className={labelClass}>
              {type === "wheel" ? "Wheel segments" : "Scratch prizes"}
            </Label>
            <div className="space-y-2">
              {segments.map((segment, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="text"
                    required
                    maxLength={40}
                    value={segment.label}
                    onChange={(e) =>
                      updateSegment(i, { label: e.target.value })
                    }
                    placeholder="Label"
                    className="h-11 flex-1 rounded-xl"
                  />
                  <Input
                    type="number"
                    required
                    min={1}
                    max={100}
                    value={segment.weight}
                    onChange={(e) =>
                      updateSegment(i, { weight: Number(e.target.value) })
                    }
                    className="h-11 w-20 rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateSegment(i, { is_reward: !segment.is_reward })
                    }
                    className={cn(
                      "h-11 shrink-0 rounded-xl border px-3 text-xs font-semibold transition-colors",
                      segment.is_reward
                        ? "border-gold bg-gold/10 text-gold-accent"
                        : "bg-card text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {segment.is_reward ? "Reward" : "No win"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSegment(i)}
                    disabled={segments.length <= 2}
                    className="h-11 shrink-0 rounded-xl border px-3 text-xs font-semibold text-muted-foreground hover:bg-muted/50 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addSegment}
              disabled={segments.length >= 6}
              className="h-11 w-full rounded-xl border text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-40"
            >
              Add segment
            </button>
            <input
              type="hidden"
              name="segments"
              value={JSON.stringify(segments)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pity_ceiling" className={labelClass}>
              Guaranteed win by (optional)
            </Label>
            <Input
              id="pity_ceiling"
              name="pity_ceiling"
              type="number"
              min={2}
              max={20}
              placeholder="No guarantee"
              defaultValue={config.pity_ceiling ?? ""}
              className="h-11 rounded-xl"
            />
          </div>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="win_percent" className={labelClass}>
              Win chance (%)
            </Label>
            <Input
              key={`win_percent-${prefillGeneration}`}
              id="win_percent"
              name="win_percent"
              type="number"
              required
              min={2}
              max={100}
              placeholder="20"
              defaultValue={
                prefill?.win_percent ??
                (config.win_probability
                  ? Math.round(config.win_probability * 100)
                  : 20)
              }
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pity_ceiling" className={labelClass}>
              Guaranteed win by
            </Label>
            <Input
              key={`pity_ceiling-${prefillGeneration}`}
              id="pity_ceiling"
              name="pity_ceiling"
              type="number"
              required
              min={2}
              max={20}
              placeholder="8"
              defaultValue={prefill?.pity_ceiling ?? config.pity_ceiling ?? 8}
              className="h-11 rounded-xl"
            />
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="reward_text" className={labelClass}>
          Reward
        </Label>
        <Input
          key={`reward_text-${prefillGeneration}`}
          id="reward_text"
          name="reward_text"
          type="text"
          required
          maxLength={80}
          placeholder="Free kopi"
          defaultValue={
            prefill?.reward_text ??
            program?.reward_text ??
            config.reward_text ??
            ""
          }
          className="h-11 rounded-xl"
        />
      </div>

      {(type === "stamp" || type === "plant" || type === "streak") && (
        <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
          <input
            type="checkbox"
            id="head_start_checkbox"
            checked={headStart}
            onChange={(e) => setHeadStart(e.target.checked)}
            className="mt-0.5 size-4 rounded border-input"
          />
          <label htmlFor="head_start_checkbox" className="text-sm">
            <span className="font-medium">Give new customers a head start</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              New signups start with a small amount of free progress toward
              their first reward — shown to measurably increase completion.
            </span>
          </label>
          <input
            type="hidden"
            name="head_start"
            value={headStart ? "true" : "false"}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="expiry_days" className={labelClass}>
          Card expires after (days, optional)
        </Label>
        <Input
          id="expiry_days"
          name="expiry_days"
          type="number"
          min={1}
          max={3650}
          placeholder="Never expires"
          defaultValue={program?.expiry_days ?? ""}
          className="h-11 rounded-xl"
        />
        <p className="text-xs text-muted-foreground">
          Counted from each customer&apos;s current cycle — resets whenever
          their card is regenerated. Leave blank for a card that never expires.
        </p>
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
        {isEdit ? "Save changes" : replacingId ? "Change type" : "Create card"}
      </Button>
    </form>
  );
}
```

Note what did NOT change from the pre-existing file: the wheel/scratch
`segments` editor stays controlled `useState` (unaffected by the
prefill/key mechanism — no template in `TEMPLATES` sets `segments`, so
`DEFAULT_SEGMENTS` is still what a wheel/scratch template starts from),
and `expiry_days`/`pity_ceiling` (the optional wheel/scratch one) are
unchanged since no template sets those fields either.

- [ ] **Step 2: Run typecheck to catch the now-broken call site**

Run: `npx tsc --noEmit`
Expected: one error in `src/app/setup/page.tsx` — `<SetupForm
program={editing} isEdit={isEdit} />` is now missing the required
`replacingId` prop. This is expected; Step 3 fixes it.

- [ ] **Step 3: Rewrite `src/app/setup/page.tsx`**

Full replacement:

```tsx
import Link from "next/link";
import { requireVendor } from "@/lib/auth";
import {
  listPrograms,
  currentProgram,
  isPro,
  canCreateProgram,
} from "@/lib/program";
import { SetupForm } from "@/app/setup/setup-form";
import { Wordmark } from "@/components/landing/wordmark";
import { ProLock } from "@/components/pro-lock";
import { cn } from "@/lib/utils";

const typeLabel: Record<string, string> = {
  stamp: "Stamp card",
  lucky: "Lucky Tap",
  plant: "Sprout",
  wheel: "Spin the Wheel",
  scratch: "Scratch Card",
  streak: "Streak Club",
};

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; migrate?: string }>;
}) {
  await requireVendor();
  const { edit, migrate } = await searchParams;
  const programs = await listPrograms();
  const editing = edit ? currentProgram(programs, edit) : null;
  const isEdit = editing !== null;
  // Deliberately not currentProgram()'s fallback-to-first-program
  // semantics: an invalid/unowned migrate id must resolve to nothing, not
  // silently let a vendor migrate the wrong program.
  const migrating = migrate
    ? (programs.find((p) => p.id === migrate) ?? null)
    : null;
  const pro = await isPro();
  const canCreate = canCreateProgram(
    programs.filter((p) => p.active).length,
    pro,
  );
  const firstRun = programs.length === 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-5">
      <div className="w-full">
        <div className="mb-8 text-center">
          <Wordmark className="text-3xl" />
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">
            {migrating
              ? `Change ${migrating.name}'s type`
              : isEdit
                ? "Edit your card"
                : firstRun
                  ? "Set up your loyalty card"
                  : "Your loyalty programs"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {migrating
              ? "Your current card stops collecting new stamps. Customers who already have it keep it and can still redeem what they've earned — they just won't see it as something to keep working toward. Everyone gets moved onto the new card automatically next time they check their rewards."
              : isEdit
                ? "Update your loyalty card details."
                : firstRun
                  ? "Set up your loyalty card in a minute."
                  : "Manage your loyalty programs."}
          </p>
        </div>

        {!isEdit && !migrating && programs.length > 0 ? (
          <div className="mb-6 rounded-2xl border bg-card shadow-sm">
            <div className="px-7 py-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Your programs
              </h2>
              <ul className="mt-4 divide-y">
                {programs.map((program) => (
                  <li
                    key={program.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{program.name}</p>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider ring-1 ring-inset",
                            program.active
                              ? "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:bg-emerald-400/15 dark:text-emerald-400 dark:ring-emerald-400/30"
                              : "bg-secondary text-muted-foreground ring-border",
                          )}
                        >
                          {program.active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {typeLabel[program.type] ?? program.type}
                      </p>
                    </div>
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
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {isEdit || migrating || canCreate ? (
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
                You&apos;re on the free plan, which includes one loyalty
                program.
              </p>
              <ProLock label="Upgrade to Pro" className="mt-4" />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run typecheck, lint, format, and the full test suite**

Run: `pnpm check && pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/setup/setup-form.tsx src/app/setup/page.tsx
git commit -m "feat: template picker, program status badges, change-type entry point on /setup"
```

---

### Task 7: Customer-facing "this card is retired" messaging

**Files:**

- Modify: `src/app/c/status-state.ts` (`CardStatus` gains `replacedByName`)
- Modify: `src/app/c/actions.ts` (`VendorJoinRow` + mapping)
- Modify: `src/app/c/program-card-status.tsx` (conditional copy)
- Modify: `test/app/check-status-action.test.ts` (extend existing cases +
  add one)

**Interfaces:**

- Consumes: `vendor_join`'s `replaced_by_name` column (Task 1).
- Produces: `CardStatus.replacedByName: string | null` — consumed by
  `ProgramCardStatus`.

- [ ] **Step 1: Update the existing tests to account for the new field**

`checkStatusAction` will now always populate `replacedByName` on every
returned card (`null` when the program has no replacement). The two
existing tests that assert a full `CardStatus` object via `toEqual` —
"returns one card per row..." and (implicitly) any other exact-shape
assertions — need the new field added to their expectations, or they'll
fail once Step 3 lands. In `test/app/check-status-action.test.ts`, change:

```typescript
expect(result).toEqual({
  status: "found",
  phone: "+6591234567",
  cards: [
    {
      programId: "p1",
      name: "Kaya Toast Co.",
      label: "3/10 stamps",
      view: { kind: "dots", filled: 3, total: 10 },
      rewardReady: false,
      reward_text: "Free kopi",
      qr: '<svg data-token="tok_abc"></svg>',
      expired: false,
      active: true,
    },
  ],
});
```

to:

```typescript
expect(result).toEqual({
  status: "found",
  phone: "+6591234567",
  cards: [
    {
      programId: "p1",
      name: "Kaya Toast Co.",
      label: "3/10 stamps",
      view: { kind: "dots", filled: 3, total: 10 },
      rewardReady: false,
      reward_text: "Free kopi",
      qr: '<svg data-token="tok_abc"></svg>',
      expired: false,
      active: true,
      replacedByName: null,
    },
  ],
});
```

Every other `mockJoin([...])` call in this file that omits
`replaced_by_name` from its row objects is fine as-is — `undefined` on the
mock row maps to `null` via the `??` fallback added in Step 3, and those
other tests only assert specific fields (`result.cards?.[0].active`, etc.),
not the full object.

Add one new test, after the "marks a card inactive..." test:

```typescript
it("surfaces the replacement program's name on a retired card", async () => {
  mockJoin([
    {
      program_id: "p1",
      name: "Old Program",
      type: "stamp",
      config: {},
      state: {},
      stamp_count: 5,
      card_token: "tok_1",
      reward_text: "Free item",
      stamps_required: 10,
      expiry_days: null,
      cycle_started_at: null,
      active: false,
      replaced_by_name: "Weekly Regular",
    },
  ]);

  const result = await checkStatusAction(
    STATUS_IDLE,
    form({ vendor: "v1", phone: "91234567" }),
  );

  expect(result.cards?.[0].replacedByName).toBe("Weekly Regular");
});
```

- [ ] **Step 2: Run the tests to verify the new/updated ones fail**

Run: `pnpm vitest run test/app/check-status-action.test.ts`
Expected: FAIL on the updated `toEqual` case (actual object has no
`replacedByName` key yet) and the new "surfaces the replacement..." case
(`replacedByName` is `undefined`, not `"Weekly Regular"`).

- [ ] **Step 3: Update `src/app/c/status-state.ts`**

Change:

```typescript
export type CardStatus = {
  programId: string;
  name: string;
  label: string;
  view: ProgressView;
  rewardReady: boolean;
  reward_text: string;
  qr: string;
  expired: boolean;
  active: boolean;
};
```

to:

```typescript
export type CardStatus = {
  programId: string;
  name: string;
  label: string;
  view: ProgressView;
  rewardReady: boolean;
  reward_text: string;
  qr: string;
  expired: boolean;
  active: boolean;
  replacedByName: string | null;
};
```

- [ ] **Step 4: Update `src/app/c/actions.ts`**

Add `replaced_by_name: string | null;` to the `VendorJoinRow` type (after
`active: boolean;`), and add `replacedByName: row.replaced_by_name ??
null,` to the returned object inside `rows.map(...)` (after `active:
row.active,`).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run test/app/check-status-action.test.ts`
Expected: PASS, all 10 tests.

- [ ] **Step 6: Update `src/app/c/program-card-status.tsx`**

Change:

```tsx
{
  !card.active && (
    <p className="text-xs text-muted-foreground">
      This program is no longer joinable, but you can still redeem what
      you&apos;ve earned.
    </p>
  );
}
```

to:

```tsx
{
  !card.active && (
    <p className="text-xs text-muted-foreground">
      {card.replacedByName
        ? `This card is retired — check your rewards again to see your new ${card.replacedByName} card.`
        : "This program is no longer joinable, but you can still redeem what you've earned."}
    </p>
  );
}
```

- [ ] **Step 7: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/c/status-state.ts src/app/c/actions.ts src/app/c/program-card-status.tsx test/app/check-status-action.test.ts
git commit -m "feat: tell a customer what replaced their retired card"
```
