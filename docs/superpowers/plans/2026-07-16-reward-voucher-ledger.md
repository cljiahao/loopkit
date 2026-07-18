# Reward-Voucher Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every reward a real, queryable lifecycle (`earned_at` → `expires_at`/`redeemed_at`, status `active`/`redeemed`/`expired`) instead of a bare counter, with vendor-configurable expiry that hard-forfeits an unclaimed Stamp/Plant reward's underlying progress, surfaced across the counter, customers, stats, and customer-facing pages.

**Architecture:** A new `loopkit.reward_vouchers` table plus a `programs.reward_expiry_days` column (migration `0027`). Stamp's voucher creation/expiry/redemption lives entirely in SQL (`add_stamp`/`redeem`, already `security definer` RPCs) since `stamp_count`/`stamps_required` are plain columns. Plant's engine (`src/lib/engine/plant.ts`) stays pure TS — its forfeiture math (which needs `bloomThreshold(config)`, a jsonb-derived value) runs in the TS server-action layer (`recordVisitAction`/`redeemPlantAction`), calling three small generic SQL helper RPCs (`expire_stale_vouchers`, `grant_reward_voucher`, `redeem_oldest_voucher`) that both Stamp's SQL and Plant's TS path share. Lucky/Wheel/Scratch grant a voucher already `redeemed` (instant win), no expiry.

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Zod · `@supabase/ssr` · Vitest · Testing Library (`@vitest-environment jsdom` for dom tests) · pnpm.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- Validate all user input with Zod at every form/action boundary.
- Authorization lives in RLS policies and `security definer` RPCs, never widened app-side.
- `cards` and `reward_vouchers` grant `select` only to `authenticated` — all writes go through `security definer` functions. Do not add direct insert/update grants on either table.
- `programs.expiry_days` is a different, existing concept (card-cycle inactivity expiry) — the new field is `programs.reward_expiry_days`. Never conflate the two.
- SQL migrations in this project are hand-verified, not automated-tested (no linked Supabase CLI in this environment) — every migration task ends with a manual review checklist step, not a test-runner step. The user applies the migration by hand via the Supabase dashboard SQL editor.
- After the migration, `src/lib/types.ts` (a hand-written mirror, no live codegen available) must be updated to match, keeping the `loopkit` schema key in sync.
- Run `pnpm check` (prettier --check + eslint + tsc --noEmit) and `pnpm test` before every commit that touches app code; this project's Stop hook re-runs the test suite regardless.
- Follow existing project conventions exactly: `ActionResult<T>` discriminated result type for server actions, `vi.hoisted` + `vi.mock` mocking style in tests, Tailwind class patterns already used in the file being edited.

---

## Task 1: Pure threshold-crossing helper

**Files:**

- Create: `src/lib/engine/threshold.ts`
- Test: `test/lib/engine/threshold.test.ts`

**Interfaces:**

- Produces: `countThresholdCrossings(prevCount: number, nextCount: number, required: number): number` — used by Task 2 (Plant engine) and mirrored by a SQL equivalent in Task 3 (Stamp).

- [ ] **Step 1: Write the failing test**

```typescript
// test/lib/engine/threshold.test.ts
import { describe, it, expect } from "vitest";
import { countThresholdCrossings } from "@/lib/engine/threshold";

describe("countThresholdCrossings", () => {
  it("returns 0 when no new multiple of `required` is crossed", () => {
    expect(countThresholdCrossings(1, 2, 10)).toBe(0);
  });

  it("returns 1 when incrementing by 1 lands exactly on a multiple", () => {
    expect(countThresholdCrossings(9, 10, 10)).toBe(1);
  });

  it("returns 1 when a jump lands strictly past one multiple", () => {
    expect(countThresholdCrossings(8, 13, 10)).toBe(1);
  });

  it("returns 2 when a large jump (e.g. points_per_visit) crosses two multiples in one call", () => {
    expect(countThresholdCrossings(8, 28, 10)).toBe(2);
  });

  it("returns 0 for the first-ever value that hasn't reached the threshold yet", () => {
    expect(countThresholdCrossings(0, 5, 10)).toBe(0);
  });

  it("returns 1 for the first-ever value landing exactly on the threshold", () => {
    expect(countThresholdCrossings(0, 10, 10)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/lib/engine/threshold.test.ts`
Expected: FAIL with "Failed to resolve import @/lib/engine/threshold" or "countThresholdCrossings is not a function"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/engine/threshold.ts
// How many new multiples of `required` were crossed going from prevCount to
// nextCount. Not a boolean "did we cross one" — points_per_visit (Stamp) and
// growth_per_visit (Plant) can both jump by more than 1 in a single visit,
// so a jump can cross more than one reward threshold at once.
export function countThresholdCrossings(
  prevCount: number,
  nextCount: number,
  required: number,
): number {
  return Math.floor(nextCount / required) - Math.floor(prevCount / required);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/lib/engine/threshold.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/threshold.ts test/lib/engine/threshold.test.ts
git commit -m "feat: add pure threshold-crossing count helper"
```

---

## Task 2: Plant engine computes a reward-crossing count

**Files:**

- Modify: `src/lib/engine/types.ts`
- Modify: `src/lib/engine/plant.ts`
- Test: `test/lib/engine/plant.test.ts`

**Interfaces:**

- Consumes: `countThresholdCrossings` from Task 1.
- Produces: `Strategy<C, S>.apply()` return type gains optional `rewardsUnlockedCount?: number`; `plantStrategy.apply()` sets it. `bloomThreshold(config: PlantConfig): number` becomes exported (was private) — Task 9 needs it for forfeiture math.

- [ ] **Step 1: Write the failing test**

Append to `test/lib/engine/plant.test.ts` (inside the existing `describe("plantStrategy", ...)` block, after the `"keeps growing past the bloom threshold instead of capping"` test):

```typescript
it("reports rewardsUnlockedCount of 1 when a visit crosses exactly one bloom threshold", () => {
  const r = plantStrategy.apply(
    { kind: "visit" },
    { growth: 7, last_visit_at: day0.toISOString(), blooms: 0 },
    cfg,
    day0,
  );
  expect(r.rewardsUnlockedCount).toBe(1);
});

it("reports rewardsUnlockedCount of 0 when growth stays within one already-bloomed cycle", () => {
  const r = plantStrategy.apply(
    { kind: "visit" },
    { growth: 8, last_visit_at: day0.toISOString(), blooms: 0, bloomed: true },
    cfg,
    day0,
  );
  expect(r.rewardsUnlockedCount).toBe(0);
});

it("reports rewardsUnlockedCount of 2 when growth_per_visit is large enough to cross two bloom thresholds at once", () => {
  const bigCfg: PlantConfig = { ...cfg, growth_per_visit: 20 };
  const r = plantStrategy.apply(
    { kind: "visit" },
    { growth: 0, last_visit_at: day0.toISOString(), blooms: 0 },
    bigCfg,
    day0,
  );
  expect(r.rewardsUnlockedCount).toBe(2);
});
```

Also add `import { bloomThreshold } from "@/lib/engine/plant";` is NOT needed for this test file (it doesn't test `bloomThreshold` directly) — skip.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/lib/engine/plant.test.ts`
Expected: FAIL — `r.rewardsUnlockedCount` is `undefined`, not `1`/`0`/`2`

- [ ] **Step 3: Update the Strategy interface**

In `src/lib/engine/types.ts`, change the `apply` method's return type:

```typescript
  apply(
    event: EngineEvent,
    state: S,
    config: C,
    now: Date,
  ): { state: S; rewardUnlocked: boolean; rewardsUnlockedCount?: number };
```

- [ ] **Step 4: Update plant.ts to export bloomThreshold and compute the crossing count**

In `src/lib/engine/plant.ts`, add the import and export the function:

```typescript
import type { Strategy } from "@/lib/engine/types";
import { countThresholdCrossings } from "@/lib/engine/threshold";
```

Change `function bloomThreshold` to `export function bloomThreshold`.

Change the `apply` method body:

```typescript
  apply(event, state, config, now) {
    if (event.kind !== "visit") return { state, rewardUnlocked: false };
    const settled = decayedGrowth(state, config, now);
    const bloom = bloomThreshold(config);
    const growth = settled + config.growth_per_visit;
    const bloomed = state.bloomed === true || growth >= bloom;
    const rewardsUnlockedCount = countThresholdCrossings(settled, growth, bloom);
    return {
      state: {
        growth,
        last_visit_at: now.toISOString(),
        blooms: state.blooms,
        bloomed,
      },
      rewardUnlocked: rewardsUnlockedCount > 0,
      rewardsUnlockedCount,
    };
  },
```

This is behavior-preserving for every existing test: `rewardUnlocked` is still exactly `settled < bloom && growth >= bloom` in the single-crossing case (`floor(settled/bloom)` goes from 0 to 1), and stays `false` once already bloomed and growth stays within the same multiple (`floor(8/8)=1`, `floor(9/8)=1` → 0 crossings).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run test/lib/engine/plant.test.ts`
Expected: PASS (all prior tests plus the 3 new ones)

- [ ] **Step 6: Commit**

```bash
git add src/lib/engine/types.ts src/lib/engine/plant.ts test/lib/engine/plant.test.ts
git commit -m "feat: plant engine reports how many reward thresholds a visit crossed"
```

---

## Task 3: Migration `0027_loopkit_reward_vouchers.sql`

**Files:**

- Create: `supabase/migrations/0027_loopkit_reward_vouchers.sql`

**Interfaces:**

- Produces (RPCs callable via `supabase.rpc(...)`, consumed by Tasks 7–9):
  - `expire_stale_vouchers(p_card uuid) returns int` — flips this card's past-expiry `active` vouchers to `expired`, returns how many.
  - `grant_reward_voucher(p_card uuid, p_reward_text text, p_expiry_days int, p_count int default 1, p_immediate boolean default false) returns void` — inserts `p_count` voucher rows; `p_immediate=true` (Lucky/Wheel/Scratch) inserts them already `redeemed`.
  - `redeem_oldest_voucher(p_card uuid) returns void` — marks the oldest `active` voucher `redeemed`; raises `no_active_voucher` if none exist.
- Modifies existing RPCs' bodies (same signatures, no TS call-site changes needed for these three): `add_stamp`, `redeem`, `vendor_join`.
- Modifies `create_program`'s signature: adds trailing `p_reward_expiry_days int default null` (Task 5 updates callers).
- New column: `programs.reward_expiry_days int`.
- New table: `reward_vouchers` (columns: `id, card_id, program_id, reward_text, earned_at, expires_at, redeemed_at, status, updated_at`).

This task has no automated test (project convention — SQL is hand-verified, no linked Supabase CLI). Steps are: write the file, self-verify against a checklist, commit the file, then the user applies it by hand.

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/0027_loopkit_reward_vouchers.sql
-- Reward-voucher ledger: every reward earned gets a row with earned_at,
-- an optional expires_at, and redeemed_at — instead of just incrementing
-- reward_count/blooms with no history. Deferred from the
-- 2026-07-14-stamp-plant-redeem-carryover brainstorm; see
-- docs/superpowers/specs/2026-07-16-reward-voucher-ledger-design.md.

create table loopkit.reward_vouchers (
  id           uuid primary key default gen_random_uuid(),
  card_id      uuid not null references loopkit.cards(id) on delete cascade,
  program_id   uuid not null references loopkit.programs(id) on delete cascade,
  reward_text  text not null,
  earned_at    timestamptz not null default now(),
  expires_at   timestamptz,
  redeemed_at  timestamptz,
  status       text not null default 'active'
               check (status in ('active','redeemed','expired')),
  updated_at   timestamptz not null default now()
);

create index reward_vouchers_card_idx on loopkit.reward_vouchers(card_id, status);

alter table loopkit.reward_vouchers enable row level security;

create policy reward_vouchers_own on loopkit.reward_vouchers
  for select using (loopkit.owns_program(program_id));

grant select on loopkit.reward_vouchers to authenticated;
grant all on loopkit.reward_vouchers to service_role;

alter table loopkit.programs
  add column reward_expiry_days int
  check (reward_expiry_days is null or reward_expiry_days between 1 and 3650);

-- Same crossing-count logic as src/lib/engine/threshold.ts's
-- countThresholdCrossings — Stamp's mutation path is pure SQL (add_stamp),
-- so it needs its own copy of this one-line rule rather than calling TS.
create or replace function loopkit.count_threshold_crossings(
  p_prev int, p_next int, p_required int
)
returns int language sql immutable as $$
  select floor(p_next::numeric / p_required)::int - floor(p_prev::numeric / p_required)::int;
$$;

-- Flips this card's active-but-past-expiry vouchers to 'expired' and
-- returns how many were just flipped. Status-only — does NOT touch
-- stamp_count/growth; callers (add_stamp/redeem below, and Plant's TS
-- server actions) are responsible for forfeiting the corresponding
-- threshold's worth of progress using the returned count.
create or replace function loopkit.expire_stale_vouchers(p_card uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  if not loopkit.owns_program((select program_id from loopkit.cards where id = p_card)) then
    raise exception 'not authorized';
  end if;
  with expired as (
    update loopkit.reward_vouchers
      set status = 'expired', updated_at = now()
      where card_id = p_card and status = 'active'
        and expires_at is not null and expires_at < now()
      returning 1
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$$;

-- Inserts p_count new voucher rows for a card. p_immediate is for
-- instant-resolve types (Lucky/Wheel/Scratch): the reward is granted the
-- moment it's won, so the voucher is born already redeemed, no expiry.
create or replace function loopkit.grant_reward_voucher(
  p_card uuid, p_reward_text text, p_expiry_days int,
  p_count int default 1, p_immediate boolean default false
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_program_id uuid;
  i int;
begin
  select program_id into v_program_id from loopkit.cards where id = p_card;
  if v_program_id is null or not loopkit.owns_program(v_program_id) then
    raise exception 'not authorized';
  end if;
  for i in 1..p_count loop
    insert into loopkit.reward_vouchers
      (card_id, program_id, reward_text, expires_at, redeemed_at, status)
      values (
        p_card, v_program_id, p_reward_text,
        case when p_immediate or p_expiry_days is null
          then null else now() + (p_expiry_days || ' days')::interval end,
        case when p_immediate then now() else null end,
        case when p_immediate then 'redeemed' else 'active' end
      );
  end loop;
end;
$$;

-- Marks the oldest active voucher for this card redeemed. Raises
-- 'no_active_voucher' if none exist (post-expiry-sweep) — callers turn
-- this into a friendly "nothing to redeem" message rather than letting a
-- stale stamp_count alone decide a reward is claimable.
create or replace function loopkit.redeem_oldest_voucher(p_card uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not loopkit.owns_program((select program_id from loopkit.cards where id = p_card)) then
    raise exception 'not authorized';
  end if;
  select id into v_id from loopkit.reward_vouchers
    where card_id = p_card and status = 'active'
    order by earned_at asc limit 1;
  if v_id is null then
    raise exception 'no_active_voucher';
  end if;
  update loopkit.reward_vouchers
    set status = 'redeemed', redeemed_at = now(), updated_at = now()
    where id = v_id;
end;
$$;

grant execute on function loopkit.expire_stale_vouchers(uuid) to authenticated;
grant execute on function loopkit.grant_reward_voucher(uuid, text, int, int, boolean) to authenticated;
grant execute on function loopkit.redeem_oldest_voucher(uuid) to authenticated;

-- create_program: additive trailing p_reward_expiry_days, same pattern as
-- every prior additive param on this function (p_expiry_days, p_head_start, ...).
create or replace function loopkit.create_program(
  p_type               text,
  p_name               text,
  p_stamps_required    int,
  p_reward_text        text,
  p_config             jsonb,
  p_expiry_days        int default null,
  p_head_start         boolean default false,
  p_carry_over_stamps  boolean default false,
  p_active             boolean default true,
  p_head_start_percent int default 20,
  p_reward_expiry_days int default null
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
     head_start, carry_over_stamps, active, head_start_percent, reward_expiry_days)
    values (v_uid, p_type, p_name, p_stamps_required, p_reward_text, p_config,
            p_expiry_days, p_head_start, p_carry_over_stamps, p_active,
            p_head_start_percent, p_reward_expiry_days)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function loopkit.create_program(
  text, text, int, text, jsonb, int, boolean, boolean, boolean, int, int
) to authenticated;

-- add_stamp: same increment-by-points_per_visit behavior as 0026, plus
-- voucher bookkeeping — sweep this card's expired vouchers (forfeiting
-- their stamps) before applying this visit's stamps, then grant a new
-- voucher for every threshold multiple this visit crosses.
create or replace function loopkit.add_stamp(p_program uuid, p_phone text)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare
  v_card loopkit.cards;
  v_card_id uuid;
  v_config jsonb;
  v_amount int;
  v_required int;
  v_reward_text text;
  v_reward_expiry_days int;
  v_expired_count int;
  v_prev int;
  v_crossings int;
begin
  if not loopkit.owns_program(p_program) then
    raise exception 'not authorized';
  end if;

  select config, stamps_required, reward_text, reward_expiry_days
    into v_config, v_required, v_reward_text, v_reward_expiry_days
    from loopkit.programs where id = p_program;
  v_amount := coalesce((v_config->>'points_per_visit')::int, 1);

  -- First stamp for this phone: create the card and log it. on conflict
  -- do nothing absorbs a race between two concurrent first-ever calls for
  -- the same phone — the loser falls through to the existing-card branch
  -- below (via the re-select by program_id+phone) instead of raising an
  -- unhandled unique_violation. Same safety net 0026 relied on — do not
  -- drop this the way an earlier draft of this migration did (caught by
  -- task review before the migration was applied).
  insert into loopkit.cards (program_id, phone, stamp_count)
    values (p_program, p_phone, v_amount)
  on conflict (program_id, phone) do nothing
  returning * into v_card;
  if v_card.id is not null then
    insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
    v_crossings := loopkit.count_threshold_crossings(0, v_amount, v_required);
    if v_crossings > 0 then
      perform loopkit.grant_reward_voucher(v_card.id, v_reward_text, v_reward_expiry_days, v_crossings, false);
    end if;
    return v_card;
  end if;

  -- Existing card (including a just-lost insert race above): sweep
  -- expired vouchers first, forfeiting their stamps, then always
  -- increment by v_amount, no ceiling.
  select id into v_card_id from loopkit.cards
    where program_id = p_program and phone = p_phone;
  v_expired_count := loopkit.expire_stale_vouchers(v_card_id);

  select stamp_count into v_prev from loopkit.cards where id = v_card_id;
  v_prev := greatest(v_prev - v_expired_count * v_required, 0);

  update loopkit.cards
    set stamp_count = v_prev + v_amount, updated_at = now()
    where id = v_card_id
  returning * into v_card;
  insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');

  v_crossings := loopkit.count_threshold_crossings(v_prev, v_card.stamp_count, v_required);
  if v_crossings > 0 then
    perform loopkit.grant_reward_voucher(v_card.id, v_reward_text, v_reward_expiry_days, v_crossings, false);
  end if;
  return v_card;
end;
$$;

-- redeem: sweep expired vouchers (forfeiting their stamps) before
-- consuming, then require an active voucher to actually redeem — a stray
-- stamp_count no longer alone decides a reward is claimable.
create or replace function loopkit.redeem(p_card uuid)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare
  v_card          loopkit.cards;
  v_required      int;
  v_expired_count int;
begin
  select * into v_card from loopkit.cards where id = p_card;
  if v_card.id is null or not loopkit.owns_program(v_card.program_id) then
    raise exception 'not authorized';
  end if;

  select stamps_required into v_required
    from loopkit.programs
    where id = v_card.program_id;

  v_expired_count := loopkit.expire_stale_vouchers(p_card);
  perform loopkit.redeem_oldest_voucher(p_card); -- raises no_active_voucher if none left

  update loopkit.cards
    set stamp_count = greatest(stamp_count - v_expired_count * v_required - v_required, 0),
        reward_count = reward_count + 1,
        updated_at = now()
    where id = p_card returning * into v_card;
  insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'redeem');
  return v_card;
end;
$$;

-- vendor_join: surface the customer's oldest active voucher's expiry (if
-- any) so /c can show "redeem within N days". Same DROP-then-CREATE-OR-
-- REPLACE requirement as prior RETURNS TABLE column additions (0016, 0018).
drop function if exists loopkit.vendor_join(uuid, text);

create or replace function loopkit.vendor_join(p_vendor uuid, p_phone text)
returns table (
  program_id uuid, name text, type text, config jsonb, state jsonb,
  stamp_count int, card_token text, reward_text text, stamps_required int,
  expiry_days int, cycle_started_at timestamptz, active boolean,
  replaced_by_name text, replaced_by_stamp_count int,
  voucher_expires_at timestamptz
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
           r.name, nc.stamp_count,
           (select min(rv.expires_at) from loopkit.reward_vouchers rv
              where rv.card_id = c.id and rv.status = 'active' and rv.expires_at is not null)
    from loopkit.cards c
    join loopkit.programs p on p.id = c.program_id
    left join loopkit.programs r on r.id = p.replaced_by
    left join loopkit.cards nc on nc.program_id = p.replaced_by and nc.phone = c.phone
    where p.vendor_id = p_vendor and c.phone = p_phone
    order by c.created_at asc;
end;
$$;

grant execute on function loopkit.vendor_join(uuid, text) to anon, authenticated, service_role;
```

- [ ] **Step 2: Hand-verify against this checklist (no automated test)**

- [ ] `reward_vouchers` has no direct `insert`/`update` grant to `authenticated` — only `select`, matching `cards`'s pattern.
- [ ] Every new/changed `security definer` function (every one in this file except `count_threshold_crossings`, which is a plain `immutable` SQL function with no table access and needs no elevated privilege) uses `set search_path = ''` and schema-qualifies every reference (`loopkit.cards`, `loopkit.programs`, etc.) — an unqualified name would resolve against the caller's search_path, a known Postgres security-definer pitfall this codebase already guards against elsewhere.
- [ ] `add_stamp`'s "first stamp" insert keeps `on conflict (program_id, phone) do nothing` (do not replace it with a plain `select ... is null` probe followed by an unconditional insert — that drops 0026's race safety: under concurrent first-ever calls for the same phone, the losing transaction's insert would raise an unhandled `unique_violation` instead of gracefully falling through to the existing-card branch). Confirm the "first stamp" and "existing card" branches are mutually exclusive and that the existing-card branch's `v_card_id` lookup happens _after_ the on-conflict insert attempt, so it also correctly picks up a just-lost race.
- [ ] `redeem`'s forfeiture math (`stamp_count - v_expired_count * v_required - v_required`) matches `expire_stale_vouchers`' contract: it returns a **count of vouchers**, not an amount — confirm the multiplication by `v_required` is present (an amount vs. count mixup here would silently under- or over-forfeit).
- [ ] `redeem_oldest_voucher` runs **after** `expire_stale_vouchers` in both `redeem` and the checklist for Task 9's Plant path — reversing the order would let it redeem a voucher that should have just expired.
- [ ] `create_program`'s new trailing param has a default (`p_reward_expiry_days int default null`) and the `grant execute` signature list matches the full new parameter list exactly (11 types, including the new one) — a mismatched grant silently breaks every existing call site.
- [ ] `vendor_join`'s new `voucher_expires_at` column is the last column in `returns table` (additive position matches how `src/app/c/actions.ts`'s `VendorJoinRow` type will be extended in Task 13 — order doesn't matter for named-field destructuring, but keeping it last avoids reshuffling the existing type).

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/0027_loopkit_reward_vouchers.sql
git commit -m "feat: reward-voucher ledger migration (table, expiry, RPCs)"
```

- [ ] **Step 4: Apply the migration**

This step is manual, same as every prior migration in this repo (no linked Supabase CLI). Tell the user: "Migration `0027_loopkit_reward_vouchers.sql` is ready — please run it in the Supabase dashboard's SQL editor before the next task, since Task 4 onward assumes the new table/column/functions exist." Do not proceed to write TS code that calls these RPCs until the user confirms it's applied — the tasks that follow don't have a way to verify against a live DB either, so this confirmation is the only checkpoint.

---

## Task 4: Update `src/lib/types.ts` to mirror the migration

**Files:**

- Modify: `src/lib/types.ts`

**Interfaces:**

- Consumes: the schema from Task 3.
- Produces: `Database["loopkit"]["Tables"]["reward_vouchers"]` and the widened `programs` Row/Insert/Update — used by every subsequent TS task that queries these tables/columns under strict typing.

- [ ] **Step 1: Add `reward_expiry_days` to the `programs` table type**

In `src/lib/types.ts`, in the `programs` block, add `reward_expiry_days: number | null;` (Row) / `reward_expiry_days?: number | null;` (Insert, Update) right after the existing `expiry_days` line in each of the three sub-blocks:

```typescript
      programs: {
        Row: {
          id: string;
          vendor_id: string;
          name: string;
          stamps_required: number;
          reward_text: string;
          type: string;
          config: Json;
          active: boolean;
          expiry_days: number | null;
          reward_expiry_days: number | null;
          head_start: boolean;
          replaced_by: string | null;
          carry_over_stamps: boolean;
          head_start_percent: number;
          scheduled_deactivate_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          name: string;
          stamps_required: number;
          reward_text: string;
          type?: string;
          config?: Json;
          active?: boolean;
          expiry_days?: number | null;
          reward_expiry_days?: number | null;
          head_start?: boolean;
          replaced_by?: string | null;
          carry_over_stamps?: boolean;
          head_start_percent?: number;
          scheduled_deactivate_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          name?: string;
          stamps_required?: number;
          reward_text?: string;
          type?: string;
          config?: Json;
          active?: boolean;
          expiry_days?: number | null;
          reward_expiry_days?: number | null;
          head_start?: boolean;
          replaced_by?: string | null;
          carry_over_stamps?: boolean;
          head_start_percent?: number;
          scheduled_deactivate_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
```

- [ ] **Step 2: Add the `reward_vouchers` table type**

Insert this new block right after the `stamp_events` block (before `admins`):

```typescript
      reward_vouchers: {
        Row: {
          id: string;
          card_id: string;
          program_id: string;
          reward_text: string;
          earned_at: string;
          expires_at: string | null;
          redeemed_at: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          card_id: string;
          program_id: string;
          reward_text: string;
          earned_at?: string;
          expires_at?: string | null;
          redeemed_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          card_id?: string;
          program_id?: string;
          reward_text?: string;
          earned_at?: string;
          expires_at?: string | null;
          redeemed_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
```

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS (no errors — this is a pure type addition, nothing consumes it yet)

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: mirror reward_vouchers table and reward_expiry_days column in types.ts"
```

---

## Task 5: `programs.reward_expiry_days` end to end in `src/lib/program.ts` and `src/app/setup/actions.ts`

**Files:**

- Modify: `src/lib/program.ts`
- Modify: `src/app/setup/actions.ts`
- Modify: `test/lib/program.test.ts` (this file already exists — 8 tests for `programInputSchema`/`canPrepProgram`. Add `saveProgramSchema` to the existing import from `@/lib/program`, and append a new `describe` block below the existing ones. Do not remove or rewrite any existing test.)

**Interfaces:**

- Produces: `Program.reward_expiry_days: number | null | undefined`; `saveProgramSchema`'s `stamp` and `plant` variants gain `reward_expiry_days`. Consumed by Task 6 (setup form) and read by Task 9 (`program.reward_expiry_days` in `recordVisitAction`/`redeemPlantAction`).

- [ ] **Step 1: Write the failing test**

In `test/lib/program.test.ts`, change the existing import line from `import { programInputSchema, canPrepProgram, getEntitlement } from "@/lib/program";` to also include `saveProgramSchema`:

```typescript
import {
  programInputSchema,
  saveProgramSchema,
  canPrepProgram,
  getEntitlement,
} from "@/lib/program";
```

Then append this new `describe` block at the end of the file (after the existing `describe("canPrepProgram", ...)` block):

```typescript
describe("saveProgramSchema reward_expiry_days", () => {
  it("accepts a stamp program with reward_expiry_days set", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      reward_expiry_days: "30",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "stamp") {
      expect(result.data.reward_expiry_days).toBe(30);
    }
  });

  it("defaults to undefined (never expires) when left blank", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      reward_expiry_days: "",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "stamp") {
      expect(result.data.reward_expiry_days).toBeUndefined();
    }
  });

  it("rejects a value outside 1..3650", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      reward_expiry_days: "3651",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a plant program with reward_expiry_days set", () => {
    const result = saveProgramSchema.safeParse({
      type: "plant",
      name: "Sprout",
      reward_text: "Free plant",
      visits_to_bloom: "8",
      head_start: "false",
      reward_expiry_days: "14",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "plant") {
      expect(result.data.reward_expiry_days).toBe(14);
    }
  });

  it("lucky programs don't accept reward_expiry_days (not in that variant's schema)", () => {
    const result = saveProgramSchema.safeParse({
      type: "lucky",
      name: "Lucky Tap",
      reward_text: "Free item",
      win_percent: "20",
      pity_ceiling: "10",
      reward_expiry_days: "30",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "lucky") {
      expect("reward_expiry_days" in result.data).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/lib/program.test.ts`
Expected: FAIL — `reward_expiry_days` is not a recognized key on the `stamp`/`plant` schema variants (Zod's default is to strip unknown keys, so parsing itself may still succeed but `result.data.reward_expiry_days` will be `undefined` even for the "set to 30" case, and the "rejects 3651" test will fail since there's no such constraint yet)

- [ ] **Step 3: Add the schema field and Program type field**

In `src/lib/program.ts`, add right after `expiry_days: number | null;` in the `Program` type:

```typescript
  reward_expiry_days?: number | null;
```

Update `PROGRAM_COLUMNS`:

```typescript
const PROGRAM_COLUMNS =
  "id,name,stamps_required,reward_text,type,config,active,expiry_days,reward_expiry_days,head_start,head_start_percent,replaced_by,carry_over_stamps";
```

Add a `rewardExpiryDaysSchema` right after `expiryDaysSchema`:

```typescript
const rewardExpiryDaysSchema = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().min(1).max(3650).optional(),
);
```

Add `reward_expiry_days: rewardExpiryDaysSchema,` to the `stamp` and `plant` variants of `saveProgramSchema` only (not `lucky`/`wheel`/`scratch` — their vouchers are born already redeemed, no expiry window applies):

```typescript
    z.object({
      type: z.literal("stamp"),
      name: z.string().trim().min(1).max(60),
      stamps_required: z.coerce.number().int().min(2).max(100000),
      reward_text: z.string().trim().min(1).max(80),
      head_start: z.enum(["true", "false"]).transform((v) => v === "true"),
      head_start_percent: z.preprocess(
        emptyToUndefined,
        z.coerce.number().int().min(5).max(50).optional(),
      ),
      variant: z.preprocess(
        emptyToUndefined,
        z.enum(["dots", "flame", "points"]).optional(),
      ),
      points_per_visit: z.preprocess(
        emptyToUndefined,
        z.coerce.number().int().min(1).max(1000).optional(),
      ),
      expiry_days: expiryDaysSchema,
      reward_expiry_days: rewardExpiryDaysSchema,
    }),
    z.object({
      type: z.literal("lucky"),
      name: z.string().trim().min(1).max(60),
      reward_text: z.string().trim().min(1).max(80),
      win_percent: z.coerce.number().int().min(2).max(100),
      pity_ceiling: z.coerce.number().int().min(2).max(20),
      expiry_days: expiryDaysSchema,
    }),
    z.object({
      type: z.literal("plant"),
      name: z.string().trim().min(1).max(60),
      reward_text: z.string().trim().min(1).max(80),
      visits_to_bloom: z.coerce.number().int().min(4).max(20),
      head_start: z.enum(["true", "false"]).transform((v) => v === "true"),
      head_start_percent: z.preprocess(
        emptyToUndefined,
        z.coerce.number().int().min(5).max(50).optional(),
      ),
      variant: z.preprocess(
        emptyToUndefined,
        z.enum(["plant", "cup"]).optional(),
      ),
      expiry_days: expiryDaysSchema,
      reward_expiry_days: rewardExpiryDaysSchema,
    }),
```

(Leave the `wheel`/`scratch` variants unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/lib/program.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Thread `reward_expiry_days` through `src/app/setup/actions.ts`'s three `create_program` call sites and the update branch**

In `saveProgramAction`, add `reward_expiry_days: formData.get("reward_expiry_days"),` to the `saveProgramSchema.safeParse({...})` call (both places it appears in this file — `saveProgramAction`, `changeTypeAction`, and `prepProgramAction` each have their own `safeParse` call with the same field list).

In `saveProgramAction`'s edit branch, add to the `ProgramUpdate` object:

```typescript
const update: ProgramUpdate = {
  type,
  name: data.name,
  stamps_required: stampsRequired,
  reward_text: data.reward_text,
  config,
  expiry_days: data.expiry_days ?? null,
  reward_expiry_days:
    "reward_expiry_days" in data ? (data.reward_expiry_days ?? null) : null,
  head_start: headStart,
  head_start_percent: headStartPercent,
};
```

In `saveProgramAction`'s create branch, `changeTypeAction`, and `prepProgramAction`'s `supabase.rpc("create_program", {...})` calls, add:

```typescript
    p_reward_expiry_days:
      "reward_expiry_days" in data ? (data.reward_expiry_days ?? null) : null,
```

(Use `parsed.data` instead of `data` where that's the local variable name in `changeTypeAction`/`prepProgramAction`, matching each function's existing variable naming.) The `"reward_expiry_days" in data` guard is needed because `data`'s type is the full `saveProgramSchema` discriminated union — for `lucky`/`wheel`/`scratch` variants the key doesn't exist on the type at all, so a bare `data.reward_expiry_days` wouldn't compile under strict mode without narrowing first.

- [ ] **Step 6: Typecheck and run the full test suite**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: PASS — no regressions in existing `setup-form`/`dashboard-actions` tests, which don't reference this field yet.

- [ ] **Step 7: Commit**

```bash
git add src/lib/program.ts src/app/setup/actions.ts test/lib/program.test.ts
git commit -m "feat: wire reward_expiry_days through program schema and create_program"
```

---

## Task 6: `reward_expiry_days` field in the setup form

**Files:**

- Modify: `src/app/setup/setup-form.tsx`
- Test: `src/app/setup/setup-form.dom.test.tsx`

**Interfaces:**

- Consumes: `program?.reward_expiry_days` (`Program` type from Task 5).

- [ ] **Step 1: Write the failing test**

Append to `src/app/setup/setup-form.dom.test.tsx` (as a new top-level `describe` block):

```typescript
describe("SetupForm reward expiry field", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the reward-expiry field for a stamp card", () => {
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(
      screen.getByLabelText(/reward expires after/i),
    ).toBeInTheDocument();
  });

  it("hides the reward-expiry field for a lucky card", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByLabelText(/card style|type/i, { selector: "select, [role='combobox']" }).length ? screen.getAllByRole("combobox")[0] : screen.getByText(/lucky/i));
    expect(
      screen.queryByLabelText(/reward expires after/i),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/setup/setup-form.dom.test.tsx -t "reward expiry"`
Expected: FAIL — no element with label matching `/reward expires after/i` exists yet

Note: before writing Step 4's real assertion for "hides ... for a lucky card", read the existing type-picker markup in `setup-form.tsx` (search for how `type`/`setType` is driven — likely a `<Select>` or button group) and replace the placeholder selector logic above with whatever concretely selects the "Lucky Tap" option in this form, mirroring how an existing test in this same file switches types (if none does, use `fireEvent.click` on the actual type-picker button and assert via `screen.getByText`/`getByRole` matching the real rendered option label).

- [ ] **Step 3: Add the field**

In `src/app/setup/setup-form.tsx`, in the block containing the existing `expiry_days` field (around the `Card expires after (days, optional)` label), wrap a new field in the same `type === "stamp" || type === "plant"` conditional already used for head-start (see line ~655):

```tsx
{
  (type === "stamp" || type === "plant") && (
    <div className="space-y-2">
      <Label htmlFor="reward_expiry_days" className={labelClass}>
        Reward expires after (days, optional)
      </Label>
      <Input
        id="reward_expiry_days"
        name="reward_expiry_days"
        type="number"
        min={1}
        max={3650}
        placeholder="Never expires"
        defaultValue={program?.reward_expiry_days ?? ""}
        className="h-11 rounded-xl"
      />
      <p className="text-xs text-muted-foreground">
        Counted from the moment a customer earns the reward. Left blank, an
        earned reward never expires. Different from the card-expiry setting
        above, which resets a whole card's progress after inactivity.
      </p>
    </div>
  );
}
```

Place it directly after the existing `expiry_days` field block (both are type-agnostic-adjacent settings near the bottom of the form, right before the submit button).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/setup/setup-form.dom.test.tsx`
Expected: PASS (full file, including the 2 new tests and all pre-existing ones — no regressions)

- [ ] **Step 5: Full check**

Run: `pnpm check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/setup/setup-form.tsx src/app/setup/setup-form.dom.test.tsx
git commit -m "feat: add reward-expiry field to the setup form"
```

---

## Task 7: `src/lib/vouchers.ts` — read + pure display helpers + thin RPC wrappers

**Files:**

- Create: `src/lib/vouchers.ts`
- Test: `test/lib/vouchers.test.ts`

**Interfaces:**

- Produces:
  - `VoucherRow` type
  - `listCardVouchers(cardId: string): Promise<VoucherRow[]>`
  - `oldestActiveVoucher(vouchers: VoucherRow[]): VoucherRow | null` (pure)
  - `isPastExpiry(voucher: VoucherRow, now: Date): boolean` (pure)
  - `daysUntilExpiry(expiresAt: string, now: Date): number` (pure)
  - `countJustExpired(vouchers: VoucherRow[], sinceIso: string): number` (pure)
  - `expireStaleVouchers(cardId: string): Promise<number>`
  - `grantRewardVoucher(cardId: string, rewardText: string, expiryDays: number | null, count: number, immediate: boolean): Promise<void>`
  - `redeemOldestVoucher(cardId: string): Promise<void>` (throws on `no_active_voucher`)
- Consumed by: Tasks 8, 9, 11, 12.

- [ ] **Step 1: Write the failing tests for the pure helpers**

```typescript
// test/lib/vouchers.test.ts
import { describe, it, expect } from "vitest";
import {
  oldestActiveVoucher,
  isPastExpiry,
  daysUntilExpiry,
  countJustExpired,
  type VoucherRow,
} from "@/lib/vouchers";

function voucher(overrides: Partial<VoucherRow>): VoucherRow {
  return {
    id: "v1",
    reward_text: "Free kopi",
    earned_at: "2026-07-01T00:00:00Z",
    expires_at: null,
    redeemed_at: null,
    status: "active",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("oldestActiveVoucher", () => {
  it("returns the earliest-earned active voucher", () => {
    const vouchers = [
      voucher({ id: "v2", earned_at: "2026-07-05T00:00:00Z" }),
      voucher({ id: "v1", earned_at: "2026-07-01T00:00:00Z" }),
    ];
    expect(oldestActiveVoucher(vouchers)?.id).toBe("v1");
  });

  it("ignores redeemed and expired vouchers", () => {
    const vouchers = [
      voucher({ id: "v1", status: "redeemed" }),
      voucher({ id: "v2", status: "expired" }),
    ];
    expect(oldestActiveVoucher(vouchers)).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(oldestActiveVoucher([])).toBeNull();
  });
});

describe("isPastExpiry", () => {
  it("is false when expires_at is null (never expires)", () => {
    expect(
      isPastExpiry(voucher({ expires_at: null }), new Date("2026-08-01")),
    ).toBe(false);
  });

  it("is true once now is at/after expires_at", () => {
    expect(
      isPastExpiry(
        voucher({ expires_at: "2026-07-10T00:00:00Z" }),
        new Date("2026-07-10T00:00:01Z"),
      ),
    ).toBe(true);
  });

  it("is false before expires_at", () => {
    expect(
      isPastExpiry(
        voucher({ expires_at: "2026-07-10T00:00:00Z" }),
        new Date("2026-07-09T00:00:00Z"),
      ),
    ).toBe(false);
  });
});

describe("daysUntilExpiry", () => {
  it("rounds up to whole days", () => {
    expect(
      daysUntilExpiry("2026-07-12T00:00:00Z", new Date("2026-07-10T00:00:00Z")),
    ).toBe(2);
  });

  it("floors at 0 for a past date", () => {
    expect(
      daysUntilExpiry("2026-07-01T00:00:00Z", new Date("2026-07-10T00:00:00Z")),
    ).toBe(0);
  });
});

describe("countJustExpired", () => {
  it("counts only expired vouchers updated at/after the given timestamp", () => {
    const vouchers = [
      voucher({
        id: "v1",
        status: "expired",
        updated_at: "2026-07-10T10:00:00Z",
      }),
      voucher({
        id: "v2",
        status: "expired",
        updated_at: "2026-07-01T00:00:00Z",
      }),
      voucher({
        id: "v3",
        status: "active",
        updated_at: "2026-07-10T10:00:00Z",
      }),
    ];
    expect(countJustExpired(vouchers, "2026-07-10T09:00:00Z")).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/lib/vouchers.test.ts`
Expected: FAIL with "Failed to resolve import @/lib/vouchers"

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/vouchers.ts
import { createServerClient } from "@/lib/supabase/server";

export type VoucherRow = {
  id: string;
  reward_text: string;
  earned_at: string;
  expires_at: string | null;
  redeemed_at: string | null;
  status: "active" | "redeemed" | "expired";
  updated_at: string;
};

const VOUCHER_COLUMNS =
  "id,reward_text,earned_at,expires_at,redeemed_at,status,updated_at";

// Impure shell: every voucher a card has ever had, most recently earned
// first. RLS (reward_vouchers_own) scopes this to programs the signed-in
// vendor owns.
export async function listCardVouchers(cardId: string): Promise<VoucherRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("reward_vouchers")
    .select(VOUCHER_COLUMNS)
    .eq("card_id", cardId)
    .order("earned_at", { ascending: false });
  if (error) throw new Error(`listCardVouchers: ${error.message}`);
  return (data ?? []) as VoucherRow[];
}

// Pure: the earliest still-`active`-status voucher, or null. This is the
// DB's status, not a display-adjusted "is it actually past expiry" check —
// see isPastExpiry for that.
export function oldestActiveVoucher(vouchers: VoucherRow[]): VoucherRow | null {
  const active = vouchers.filter((v) => v.status === "active");
  if (active.length === 0) return null;
  return active.reduce((oldest, v) =>
    v.earned_at < oldest.earned_at ? v : oldest,
  );
}

// Pure: true when an active-status voucher's expires_at has already passed
// but the DB row hasn't been swept yet (only add_stamp/redeem/Plant's
// visit path can sweep — a read-only view just displays this). Never
// mutates anything.
export function isPastExpiry(voucher: VoucherRow, now: Date): boolean {
  return voucher.expires_at !== null && new Date(voucher.expires_at) <= now;
}

// Pure: whole days until expiry, floored at 0. Only meaningful when
// expires_at is non-null — callers check that first.
export function daysUntilExpiry(expiresAt: string, now: Date): number {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

// Pure: vouchers that flipped to 'expired' at/after sinceIso — i.e. during
// the current request. Lets a caller toast "a reward just expired" without
// add_stamp/redeem needing to change their return shape.
export function countJustExpired(
  vouchers: VoucherRow[],
  sinceIso: string,
): number {
  return vouchers.filter(
    (v) => v.status === "expired" && v.updated_at >= sinceIso,
  ).length;
}

// Impure shell: sweeps this card's past-expiry active vouchers, returns how
// many were just flipped. Callers forfeit the corresponding threshold's
// worth of progress themselves (Stamp does this in SQL already inside
// add_stamp/redeem; Plant's TS server actions call this directly).
export async function expireStaleVouchers(cardId: string): Promise<number> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("expire_stale_vouchers", {
    p_card: cardId,
  });
  if (error) throw new Error(`expireStaleVouchers: ${error.message}`);
  return data ?? 0;
}

// Impure shell: grants `count` new vouchers for a card. `immediate` is for
// instant-resolve types (Lucky/Wheel/Scratch) — born already redeemed.
export async function grantRewardVoucher(
  cardId: string,
  rewardText: string,
  expiryDays: number | null,
  count: number,
  immediate: boolean,
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("grant_reward_voucher", {
    p_card: cardId,
    p_reward_text: rewardText,
    p_expiry_days: expiryDays,
    p_count: count,
    p_immediate: immediate,
  });
  if (error) throw new Error(`grantRewardVoucher: ${error.message}`);
}

// Impure shell: marks the oldest active voucher redeemed. Throws with the
// raw Postgres message (including "no_active_voucher" when none exist) —
// callers pattern-match on that to show a friendly error.
export async function redeemOldestVoucher(cardId: string): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("redeem_oldest_voucher", {
    p_card: cardId,
  });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/lib/vouchers.test.ts`
Expected: PASS (all pure-helper tests; the impure shells aren't unit-tested here — Tasks 8/9 exercise them indirectly via mocked `@/lib/vouchers` in the action tests)

- [ ] **Step 5: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/vouchers.ts test/lib/vouchers.test.ts
git commit -m "feat: add voucher read/display helpers and RPC wrappers"
```

---

## Task 8: Surface voucher info in Stamp's `stampAction`/`lookupAction`/`redeemAction`

**Files:**

- Modify: `src/app/dashboard/actions.ts`
- Test: `test/app/dashboard-actions.test.ts`

**Interfaces:**

- Consumes: `listCardVouchers`, `oldestActiveVoucher`, `countJustExpired` from Task 7.
- Produces: `CardResult`/`LookupResult` gain `voucherExpiresAt: string | null` and (`stampAction`/`redeemAction` only) `justExpiredCount: number`. Consumed by Task 10.

- [ ] **Step 1: Write the failing tests**

Add to `test/app/dashboard-actions.test.ts`. First extend the mock setup — add a mock for `@/lib/vouchers` near the top, alongside the existing `vi.mock` calls:

```typescript
const { listCardVouchersMock } = vi.hoisted(() => ({
  listCardVouchersMock: vi.fn(),
}));
vi.mock("@/lib/vouchers", () => ({
  listCardVouchers: listCardVouchersMock,
  oldestActiveVoucher: (vouchers: { status: string; earned_at: string }[]) => {
    const active = vouchers.filter((v) => v.status === "active");
    if (active.length === 0) return null;
    return active.reduce((oldest, v) =>
      v.earned_at < oldest.earned_at ? v : oldest,
    );
  },
  countJustExpired: (
    vouchers: { status: string; updated_at: string }[],
    since: string,
  ) =>
    vouchers.filter((v) => v.status === "expired" && v.updated_at >= since)
      .length,
}));
```

Then add these tests inside the existing `describe("dashboard actions thread program_id", ...)` block:

```typescript
it("stampAction surfaces the active voucher's expiry when one exists", async () => {
  getProgramByIdMock.mockResolvedValue(program);
  rpcMock.mockResolvedValue({
    data: { id: "c1", phone: "+6591234567", stamp_count: 10 },
    error: null,
  });
  listCardVouchersMock.mockResolvedValue([
    {
      id: "v1",
      status: "active",
      earned_at: "2026-07-10T00:00:00Z",
      expires_at: "2026-08-10T00:00:00Z",
      updated_at: "2026-07-10T00:00:00Z",
      redeemed_at: null,
      reward_text: "Free kopi",
    },
  ]);

  const res = await stampAction(form({ program_id: "p1", phone: "91234567" }));

  expect(res.success).toBe(true);
  if (res.success) {
    expect(res.voucherExpiresAt).toBe("2026-08-10T00:00:00Z");
  }
});

it("stampAction reports justExpiredCount when a voucher was swept during this call", async () => {
  getProgramByIdMock.mockResolvedValue(program);
  rpcMock.mockResolvedValue({
    data: { id: "c1", phone: "+6591234567", stamp_count: 3 },
    error: null,
  });
  listCardVouchersMock.mockResolvedValue([
    {
      id: "v1",
      status: "expired",
      earned_at: "2026-06-01T00:00:00Z",
      expires_at: "2026-06-10T00:00:00Z",
      updated_at: new Date().toISOString(),
      redeemed_at: null,
      reward_text: "Free kopi",
    },
  ]);

  const res = await stampAction(form({ program_id: "p1", phone: "91234567" }));

  expect(res.success).toBe(true);
  if (res.success) {
    expect(res.justExpiredCount).toBe(1);
  }
});

it("redeemAction turns the no_active_voucher error into a friendly message", async () => {
  rpcMock.mockResolvedValue({
    data: null,
    error: { message: "no_active_voucher" },
  });

  const res = await redeemAction(form({ card_id: "c1" }));

  expect(res.success).toBe(false);
  if (!res.success) {
    expect(res.error).toBe("Nothing to redeem — that reward expired.");
  }
});
```

Add `redeemAction` to the existing `import { stampAction, lookupAction, redeemPlantAction } from "@/app/dashboard/actions";` line.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/app/dashboard-actions.test.ts`
Expected: FAIL — `res.voucherExpiresAt`/`res.justExpiredCount` are `undefined`; `redeemAction`'s error message is still the generic "Something went wrong. Try again."

- [ ] **Step 3: Update `src/app/dashboard/actions.ts`**

Add the import:

```typescript
import {
  listCardVouchers,
  oldestActiveVoucher,
  countJustExpired,
} from "@/lib/vouchers";
```

Update `CardResult`'s type:

```typescript
type CardResult = ActionResult<{
  card: StampCard;
  rewardReady: boolean;
  voucherExpiresAt: string | null;
  justExpiredCount: number;
}>;
```

Update `stampAction`, after the `add_stamp` RPC succeeds:

```typescript
export async function stampAction(formData: FormData): Promise<CardResult> {
  await requireVendor();

  const program = await programFromForm(formData);
  if (!program) {
    return { success: false, error: "Set up your card first." };
  }

  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return { success: false, error: "Enter a valid Singapore phone number." };
  }

  const supabase = await createServerClient();
  const { data: existingCycle } = await supabase
    .from("cards")
    .select("cycle_started_at")
    .eq("program_id", program.id)
    .eq("phone", normalized.phone)
    .maybeSingle();
  if (
    existingCycle &&
    isCardExpired(
      existingCycle.cycle_started_at,
      program.expiry_days,
      new Date(),
    )
  ) {
    return {
      success: false,
      error: "This card has expired. Regenerate it to start a new cycle.",
    };
  }

  const requestStartedAt = new Date().toISOString();
  const { data: card, error } = await supabase.rpc("add_stamp", {
    p_program: program.id,
    p_phone: normalized.phone,
  });
  if (error || !card) {
    console.error("add_stamp failed", error);
    return { success: false, error: "Something went wrong. Try again." };
  }

  const vouchers = await listCardVouchers(card.id);

  revalidatePath("/dashboard");
  return {
    success: true,
    card: { id: card.id, phone: card.phone, stamp_count: card.stamp_count },
    rewardReady: rewardReady(card.stamp_count, program.stamps_required),
    voucherExpiresAt: oldestActiveVoucher(vouchers)?.expires_at ?? null,
    justExpiredCount: countJustExpired(vouchers, requestStartedAt),
  };
}
```

Update `LookupResult` and `lookupAction`:

```typescript
type LookupResult = ActionResult<{
  card: StampCard;
  progress: Progress;
  voucherExpiresAt: string | null;
}>;

// ...(function body unchanged until the return)...

const vouchers = await listCardVouchers(card.id);

return {
  success: true,
  card: { id: card.id, phone: card.phone, stamp_count: card.stamp_count },
  progress,
  voucherExpiresAt: oldestActiveVoucher(vouchers)?.expires_at ?? null,
};
```

Update `redeemAction`:

```typescript
export async function redeemAction(formData: FormData): Promise<CardResult> {
  await requireVendor();

  const parsed = z.string().min(1).safeParse(formData.get("card_id"));
  if (!parsed.success) {
    return { success: false, error: "Missing card." };
  }

  const supabase = await createServerClient();
  const requestStartedAt = new Date().toISOString();
  const { data: card, error } = await supabase.rpc("redeem", {
    p_card: parsed.data,
  });
  if (error || !card) {
    if (error?.message?.includes("no_active_voucher")) {
      return {
        success: false,
        error: "Nothing to redeem — that reward expired.",
      };
    }
    console.error("redeem failed", error);
    return { success: false, error: "Something went wrong. Try again." };
  }

  const vouchers = await listCardVouchers(card.id);

  revalidatePath("/dashboard");
  return {
    success: true,
    card: { id: card.id, phone: card.phone, stamp_count: card.stamp_count },
    rewardReady: false,
    voucherExpiresAt: null,
    justExpiredCount: countJustExpired(vouchers, requestStartedAt),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/app/dashboard-actions.test.ts`
Expected: PASS (all prior tests plus the 3 new ones — the pre-existing `stampAction`/`lookupAction` tests need `listCardVouchersMock` to resolve to `[]` by default; since `vi.hoisted` mocks default to returning `undefined` unless configured, add `listCardVouchersMock.mockResolvedValue([]);` to the shared `beforeEach` block so every pre-existing test that doesn't set it explicitly still gets a valid empty array rather than `undefined`)

- [ ] **Step 5: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS — check any other caller of `stampAction`/`lookupAction`/`redeemAction`'s result shape (e.g. `serve-customer.tsx`, handled in Task 10) doesn't break from the new required fields; if `pnpm tsc` flags `serve-customer.tsx` here, that's expected — Task 10 fixes it. Confirm the error is limited to that one file.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/actions.ts test/app/dashboard-actions.test.ts
git commit -m "feat: surface voucher expiry and no_active_voucher error in Stamp actions"
```

---

## Task 9: Plant's lazy-expiry forfeit + voucher grant in `recordVisitAction`/`redeemPlantAction`

**Files:**

- Modify: `src/app/dashboard/actions.ts`
- Test: `test/app/dashboard-actions.test.ts`

**Interfaces:**

- Consumes: `expireStaleVouchers`, `grantRewardVoucher`, `redeemOldestVoucher` from Task 7; `bloomThreshold` from Task 2.
- Produces: `VisitResult` gains `voucherExpiresAt: string | null`; `redeemPlantAction`'s `ActionResult` return can now fail with the "Nothing to redeem" message too.

- [ ] **Step 1: Write the failing tests**

Extend the `@/lib/vouchers` mock from Task 8 (same `vi.mock` block) to also export the three new functions as mocks:

```typescript
const {
  listCardVouchersMock,
  expireStaleVouchersMock,
  grantRewardVoucherMock,
  redeemOldestVoucherMock,
} = vi.hoisted(() => ({
  listCardVouchersMock: vi.fn(),
  expireStaleVouchersMock: vi.fn(),
  grantRewardVoucherMock: vi.fn(),
  redeemOldestVoucherMock: vi.fn(),
}));
vi.mock("@/lib/vouchers", () => ({
  listCardVouchers: listCardVouchersMock,
  expireStaleVouchers: expireStaleVouchersMock,
  grantRewardVoucher: grantRewardVoucherMock,
  redeemOldestVoucher: redeemOldestVoucherMock,
  oldestActiveVoucher: (vouchers: { status: string; earned_at: string }[]) => {
    const active = vouchers.filter((v) => v.status === "active");
    if (active.length === 0) return null;
    return active.reduce((oldest, v) =>
      v.earned_at < oldest.earned_at ? v : oldest,
    );
  },
  countJustExpired: (
    vouchers: { status: string; updated_at: string }[],
    since: string,
  ) =>
    vouchers.filter((v) => v.status === "expired" && v.updated_at >= since)
      .length,
}));
```

(This replaces the Task 8 mock block in the same file — merge them into one `vi.mock("@/lib/vouchers", ...)` call with all six exports.)

In the shared `beforeEach` for the top describe block, add:

```typescript
expireStaleVouchersMock.mockResolvedValue(0);
listCardVouchersMock.mockResolvedValue([]);
```

Add these tests inside `describe("redeemPlantAction returns fresh progress", ...)`:

```typescript
it("forfeits growth for expired vouchers before redeeming", async () => {
  const plantProgram = {
    id: "p2",
    name: "Sprout",
    stamps_required: 8,
    reward_text: "Free plant",
    type: "plant",
    config: buildPlantConfig(8, "Free plant"),
    active: true,
  };
  getProgramByIdMock.mockResolvedValue(plantProgram);
  maybeSingleMock.mockResolvedValue({
    data: {
      id: "card-1",
      state: {
        growth: 16,
        last_visit_at: "2026-01-01T00:00:00Z",
        blooms: 0,
        bloomed: true,
      },
    },
    error: null,
  });
  expireStaleVouchersMock.mockResolvedValue(1); // one bloom's worth forfeited
  redeemOldestVoucherMock.mockResolvedValue(undefined);
  rpcMock.mockResolvedValue({ data: null, error: null });

  const res = await redeemPlantAction(
    form({ program_id: "p2", phone: "91234567" }),
  );

  expect(res.success).toBe(true);
  // growth 16 - (1 forfeited bloom * 8) = 8, then redeem carries over
  // 8 - 8 = 0.
  if (res.success) {
    expect(res.progress.view).toMatchObject({ kind: "plant", stage: 0 });
  }
});

it("returns a friendly error when there's no active voucher left to redeem", async () => {
  const plantProgram = {
    id: "p2",
    name: "Sprout",
    stamps_required: 8,
    reward_text: "Free plant",
    type: "plant",
    config: buildPlantConfig(8, "Free plant"),
    active: true,
  };
  getProgramByIdMock.mockResolvedValue(plantProgram);
  maybeSingleMock.mockResolvedValue({
    data: {
      id: "card-1",
      state: { growth: 8, last_visit_at: "2026-01-01T00:00:00Z", blooms: 0 },
    },
    error: null,
  });
  expireStaleVouchersMock.mockResolvedValue(0);
  redeemOldestVoucherMock.mockRejectedValue(new Error("no_active_voucher"));

  const res = await redeemPlantAction(
    form({ program_id: "p2", phone: "91234567" }),
  );

  expect(res.success).toBe(false);
  if (!res.success) {
    expect(res.error).toBe("Nothing to redeem — that reward expired.");
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/app/dashboard-actions.test.ts`
Expected: FAIL — `redeemPlantAction` doesn't call `expireStaleVouchers`/`redeemOldestVoucher` yet, so the forfeit test's growth math is wrong and the error-message test gets the old generic error

- [ ] **Step 3: Update `recordVisitAction`**

```typescript
export async function recordVisitAction(
  formData: FormData,
): Promise<VisitResult> {
  await requireVendor();
  const program = await programFromForm(formData);
  if (!program) return { success: false, error: "Set up your card first." };
  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return { success: false, error: "Enter a valid Singapore phone number." };
  }

  const supabase = await createServerClient();
  const { data: existing } = await supabase
    .from("cards")
    .select("id,phone,stamp_count,reward_count,state,cycle_started_at")
    .eq("program_id", program.id)
    .eq("phone", normalized.phone)
    .maybeSingle();

  const now = new Date();
  if (
    existing &&
    isCardExpired(existing.cycle_started_at, program.expiry_days, now)
  ) {
    return {
      success: false,
      error: "This card has expired. Regenerate it to start a new cycle.",
    };
  }

  let card = existing ?? { state: {}, stamp_count: 0, reward_count: 0 };

  // Plant: sweep expired vouchers and forfeit their growth before this
  // visit is applied, so an unclaimed-past-expiry bloom can't silently
  // carry a reward the vendor already lost track of. Only meaningful for
  // an existing card — a brand-new card has no vouchers yet.
  if (program.type === "plant" && existing) {
    const expiredCount = await expireStaleVouchers(existing.id);
    if (expiredCount > 0) {
      const config = program.config as PlantConfig;
      const settled = resolvePlantState(card);
      card = {
        ...card,
        state: {
          ...settled,
          growth: Math.max(
            0,
            settled.growth - expiredCount * bloomThreshold(config),
          ),
        },
      };
    }
  }

  const event = { kind: "visit" as const, payload: { roll: Math.random() } };
  const { state, rewardUnlocked, rewardsUnlockedCount } = applyVisit(
    program,
    card,
    event,
    now,
  );

  const { error } = await supabase.rpc("record_visit", {
    p_program: program.id,
    p_phone: normalized.phone,
    p_state: state as Json,
    p_kind: "visit",
    p_payload: { won: rewardUnlocked, roll: event.payload.roll },
  });
  if (error) {
    console.error("record_visit failed", error.message);
    return { success: false, error: "Something went wrong. Try again." };
  }

  const rewardText =
    (program.config as { reward_text?: string })?.reward_text ??
    program.reward_text;

  let voucherExpiresAt: string | null = null;
  if (rewardUnlocked) {
    const { data: freshCard } = await supabase
      .from("cards")
      .select("id")
      .eq("program_id", program.id)
      .eq("phone", normalized.phone)
      .maybeSingle();
    if (freshCard) {
      const count = rewardsUnlockedCount ?? 1;
      const immediate = program.type !== "plant";
      await grantRewardVoucher(
        freshCard.id,
        rewardText,
        immediate ? null : (program.reward_expiry_days ?? null),
        count,
        immediate,
      );
      if (!immediate) {
        const vouchers = await listCardVouchers(freshCard.id);
        voucherExpiresAt = oldestActiveVoucher(vouchers)?.expires_at ?? null;
      }
    }
  }

  const progress = getProgress(
    program,
    { state, stamp_count: 0, reward_count: 0 },
    now,
  );

  revalidatePath("/dashboard");
  return {
    success: true,
    rewardUnlocked,
    progress,
    reward_text: rewardText,
    phone: normalized.phone,
    voucherExpiresAt,
  };
}
```

Update `VisitResult`'s type:

```typescript
type VisitResult = ActionResult<{
  rewardUnlocked: boolean;
  progress: Progress;
  reward_text: string;
  phone: string;
  voucherExpiresAt: string | null;
}>;
```

Add the import:

```typescript
import {
  expireStaleVouchers,
  grantRewardVoucher,
  redeemOldestVoucher,
  listCardVouchers,
  oldestActiveVoucher,
  countJustExpired,
} from "@/lib/vouchers";
import { bloomThreshold } from "@/lib/engine/plant";
```

- [ ] **Step 4: Update `redeemPlantAction`**

```typescript
export async function redeemPlantAction(
  formData: FormData,
): Promise<ActionResult<{ phone: string; progress: Progress }>> {
  await requireVendor();
  const program = await programFromForm(formData);
  if (!program) return { success: false, error: "Set up your card first." };
  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return { success: false, error: "Enter a valid Singapore phone number." };
  }

  const supabase = await createServerClient();
  const { data: existing } = await supabase
    .from("cards")
    .select("id,state")
    .eq("program_id", program.id)
    .eq("phone", normalized.phone)
    .maybeSingle();
  if (!existing) {
    return { success: false, error: "No card yet for that number." };
  }

  const config = program.config as PlantConfig;
  let state = resolvePlantState({
    state: existing.state,
    stamp_count: 0,
    reward_count: 0,
  });

  const expiredCount = await expireStaleVouchers(existing.id);
  if (expiredCount > 0) {
    state = {
      ...state,
      growth: Math.max(0, state.growth - expiredCount * bloomThreshold(config)),
    };
  }

  try {
    await redeemOldestVoucher(existing.id);
  } catch (err) {
    if (err instanceof Error && err.message.includes("no_active_voucher")) {
      return {
        success: false,
        error: "Nothing to redeem — that reward expired.",
      };
    }
    console.error("redeemOldestVoucher failed", err);
    return { success: false, error: "Something went wrong. Try again." };
  }

  const reset = plantStrategy.redeem(state, config);

  const { error } = await supabase.rpc("record_visit", {
    p_program: program.id,
    p_phone: normalized.phone,
    p_state: reset as unknown as Json,
    p_kind: "redeem",
    p_payload: { reward: program.reward_text },
  });
  if (error) {
    console.error("record_visit redeem failed", error.message);
    return { success: false, error: "Something went wrong. Try again." };
  }

  const progress = getProgress(
    program,
    { state: reset, stamp_count: 0, reward_count: 0 },
    new Date(),
  );

  revalidatePath("/dashboard");
  return { success: true, phone: normalized.phone, progress };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run test/app/dashboard-actions.test.ts`
Expected: PASS (every test in the file, including the pre-existing "shows the reset Seed stage" test — it must still pass with `expireStaleVouchersMock` defaulting to `0` and `redeemOldestVoucherMock` defaulting to a resolved promise; add `redeemOldestVoucherMock.mockResolvedValue(undefined);` to that describe block's `beforeEach` too)

- [ ] **Step 6: Typecheck and full test suite**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/actions.ts test/app/dashboard-actions.test.ts
git commit -m "feat: Plant lazy-expiry forfeit and voucher grant on visit/redeem"
```

---

## Task 10: Counter UI — expiry inline, forfeiture toast, updated confirm copy

**Files:**

- Modify: `src/app/dashboard/serve-customer.tsx`
- Modify: `src/app/dashboard/redeem-button.tsx`
- Test: `src/app/dashboard/redeem-button.dom.test.tsx`

**Interfaces:**

- Consumes: `voucherExpiresAt`/`justExpiredCount` from Tasks 8–9; `daysUntilExpiry` from Task 7.

- [ ] **Step 1: Write the failing test**

Add to `src/app/dashboard/redeem-button.dom.test.tsx`:

```typescript
  it("shows the reward's expiry countdown when voucherExpiresAt is set", async () => {
    render(
      <RedeemButton
        card={{ id: "card-1", phone: "+6591234567", stamp_count: 11 }}
        stampsRequired={8}
        onRedeemed={() => {}}
        voucherExpiresAt="2026-08-15T00:00:00Z"
      />,
    );
    expect(screen.getByText(/expires in \d+ days?/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/dashboard/redeem-button.dom.test.tsx`
Expected: FAIL — `RedeemButton` doesn't accept a `voucherExpiresAt` prop and renders nothing matching that text

- [ ] **Step 3: Update `redeem-button.tsx`**

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/use-async-action";
import { redeemAction } from "@/app/dashboard/actions";
import { daysUntilExpiry } from "@/lib/vouchers";
import type { StampCard } from "@/app/dashboard/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/** Redeem control with an AlertDialog confirm — consumes exactly one reward's worth of stamps and carries the rest over to the next card. */
export function RedeemButton({
  card,
  stampsRequired,
  onRedeemed,
  voucherExpiresAt = null,
}: {
  card: StampCard;
  stampsRequired: number;
  onRedeemed: (card: StampCard) => void;
  voucherExpiresAt?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { pending, run } = useAsyncAction();

  function confirm() {
    run(async () => {
      const fd = new FormData();
      fd.set("card_id", card.id);
      const result = await redeemAction(fd);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Reward redeemed for ${card.phone}.`);
      if (result.justExpiredCount > 0) {
        toast(`A reward for ${card.phone} expired unclaimed.`);
      }
      onRedeemed(result.card);
      router.refresh();
      setOpen(false);
    });
  }

  return (
    <div className="space-y-1">
      {voucherExpiresAt && (
        <p className="text-xs text-muted-foreground">
          Expires in {daysUntilExpiry(voucherExpiresAt, new Date())} days
        </p>
      )}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" className="rounded-xl">
            Redeem
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Redeem reward?</AlertDialogTitle>
            <AlertDialogDescription>
              Redeem reward for {card.phone}? Uses {stampsRequired} stamps —
              any extra carries over to their next card.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                confirm();
              }}
            >
              {pending ? "Redeeming…" : "Redeem"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/app/dashboard/redeem-button.dom.test.tsx`
Expected: PASS (both the new test and the pre-existing confirm-copy test)

- [ ] **Step 5: Update `serve-customer.tsx`'s stamp-mode render block to pass the new prop**

In the `result?.mode === "stamp"` block, thread `voucherExpiresAt` from `result` (add it to the `StampResult` variant of the local `ServeResult` union — locate that type definition in this file, likely near the top, and add `voucherExpiresAt: string | null;` to the `mode: "stamp"` member) through `stampAction`'s response when building `setResult`, and pass it into `RedeemButton`:

```tsx
setResult({
  mode: "stamp",
  phone: res.card.phone,
  card: res.card,
  rewardReady: res.rewardReady,
  voucherExpiresAt: res.voucherExpiresAt,
});
```

(This is inside `onPrimary`'s `else` branch, the Stamp path — the existing `stampAction` call already reads `res.rewardReady`, add the same field alongside it.) Also update `onLookup`'s Stamp branch (`setResult({ mode: "stamp", ... })`) to thread `voucherExpiresAt: res.voucherExpiresAt` from `lookupAction`'s response the same way.

Then in the render block:

```tsx
{
  result.rewardReady && (
    <div className="mt-3 space-y-2">
      <p className="text-sm font-semibold text-gold-accent">Reward ready!</p>
      <RedeemButton
        card={result.card}
        stampsRequired={stampsRequired}
        voucherExpiresAt={result.voucherExpiresAt}
        onRedeemed={(next) =>
          setResult({
            mode: "stamp",
            phone: next.phone,
            card: next,
            rewardReady: false,
            voucherExpiresAt: null,
          })
        }
      />
    </div>
  );
}
```

Also add a forfeiture toast for the Stamp path in `onPrimary`, right after the existing `toast.success` for a successful stamp:

```typescript
toast.success(
  `Stamped ${res.card.phone} — ${res.card.stamp_count}/${stampsRequired}`,
);
if (res.justExpiredCount > 0) {
  toast(`A reward for ${res.card.phone} expired unclaimed.`);
}
```

For Plant's redeem confirmation (the `AlertDialogDescription` reading "Redeem {rewardText} for {result.phone}? Any extra growth carries over to their next plant."), no copy change is needed here — Plant's forfeiture/no-active-voucher error already surfaces via the existing `toast.error(res.error)` path in `confirmRedeemPlant` when `redeemPlantAction` returns `{ success: false, error: "Nothing to redeem — that reward expired." }`, so this dialog's happy-path copy is unaffected.

- [ ] **Step 6: Run the full test suite and typecheck**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: PASS

- [ ] **Step 7: Full check**

Run: `pnpm check`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/serve-customer.tsx src/app/dashboard/redeem-button.tsx src/app/dashboard/redeem-button.dom.test.tsx
git commit -m "feat: show reward expiry countdown and forfeiture toast at the counter"
```

---

## Task 11: Customers page — per-card voucher badges + vendor-level "+N expired" note

**Files:**

- Modify: `src/lib/customers.ts`
- Modify: `src/app/dashboard/customers/page.tsx`
- Test: `test/lib/customers.test.ts`
- Test: `src/app/dashboard/customers/customers-page.dom.test.tsx`

**Interfaces:**

- Consumes: `VoucherRow` shape and `countJustExpired`-style filtering logic from Task 7 (reused as inline filtering, not the same function since this operates on a batch across many cards, not one card's history).
- Produces: `VendorCustomerRow` gains `recentExpiredCount: number`; program-scoped page gets a per-card voucher badge list via a new `listVouchersForCards` helper.

- [ ] **Step 1: Write the failing tests**

Add to `test/lib/customers.test.ts`:

```typescript
import { aggregateCustomers, countRecentExpiredByPhone } from "@/lib/customers";

// ...(existing tests unchanged above)...

describe("countRecentExpiredByPhone", () => {
  it("counts expired vouchers per phone within the window, keyed by phone via card_id", () => {
    const vouchers = [
      {
        card_id: "card-1",
        status: "expired",
        updated_at: "2026-07-05T00:00:00Z",
      },
      {
        card_id: "card-1",
        status: "expired",
        updated_at: "2026-05-01T00:00:00Z",
      }, // outside window
      {
        card_id: "card-2",
        status: "active",
        updated_at: "2026-07-05T00:00:00Z",
      },
    ];
    const cardPhoneById = { "card-1": "+6591234567", "card-2": "+6598765432" };

    const result = countRecentExpiredByPhone(
      vouchers,
      cardPhoneById,
      "2026-06-01T00:00:00Z",
    );

    expect(result).toEqual({ "+6591234567": 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/lib/customers.test.ts`
Expected: FAIL — `countRecentExpiredByPhone` doesn't exist

- [ ] **Step 3: Add the pure function and thread it through `aggregateCustomers`/`listVendorCustomers`**

In `src/lib/customers.ts`:

```typescript
import { createServerClient } from "@/lib/supabase/server";
import { listPrograms } from "@/lib/program";

export type VendorCustomerRow = {
  phone: string;
  name: string | null;
  programNames: string[];
  totalStamps: number;
  totalRewards: number;
  lastSeenAt: string;
  recentExpiredCount: number;
};

type CustomerFields = {
  phone: string;
  name: string | null;
  last_seen_at: string;
};
type CardFields = {
  phone: string;
  program_id: string;
  stamp_count: number;
  reward_count: number;
};
type VoucherFields = {
  card_id: string;
  status: string;
  updated_at: string;
};

// Pure: expired-voucher count per phone within the window, joined from
// vouchers (keyed by card_id) to phones (keyed by card id) — a plain TS
// join, same style as aggregateCustomers itself, rather than a Postgres
// embedded-resource select.
export function countRecentExpiredByPhone(
  vouchers: VoucherFields[],
  cardPhoneById: Record<string, string>,
  sinceIso: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of vouchers) {
    if (v.status !== "expired" || v.updated_at < sinceIso) continue;
    const phone = cardPhoneById[v.card_id];
    if (!phone) continue;
    counts[phone] = (counts[phone] ?? 0) + 1;
  }
  return counts;
}

// Pure: merge one vendor's customers rows with their cards across every
// program into one row per phone. A customer's programNames are deduped
// (a phone should only ever have one card per program, but this stays
// defensive rather than assuming the DB-level unique constraint holds).
export function aggregateCustomers(
  customers: CustomerFields[],
  cards: CardFields[],
  programNameById: Record<string, string>,
  recentExpiredByPhone: Record<string, number> = {},
): VendorCustomerRow[] {
  const cardsByPhone = new Map<string, CardFields[]>();
  for (const card of cards) {
    const existing = cardsByPhone.get(card.phone) ?? [];
    existing.push(card);
    cardsByPhone.set(card.phone, existing);
  }

  const rows = customers.map((customer) => {
    const ownCards = cardsByPhone.get(customer.phone) ?? [];
    const programNames = [...new Set(ownCards.map((c) => c.program_id))]
      .map((id) => programNameById[id])
      .filter((name): name is string => name !== undefined);
    return {
      phone: customer.phone,
      name: customer.name,
      programNames,
      totalStamps: ownCards.reduce((sum, c) => sum + c.stamp_count, 0),
      totalRewards: ownCards.reduce((sum, c) => sum + c.reward_count, 0),
      lastSeenAt: customer.last_seen_at,
      recentExpiredCount: recentExpiredByPhone[customer.phone] ?? 0,
    };
  });

  return rows.sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
}

// Impure shell: the signed-in vendor's customers across every program, most
// recently active first. RLS scopes both `customers` and `cards` to the
// vendor automatically (owns_program / customers_own), so no explicit
// vendor_id filter is needed here — only the program-id narrowing for the
// cards join.
export async function listVendorCustomers(
  q?: string,
): Promise<VendorCustomerRow[]> {
  const supabase = await createServerClient();
  const programs = await listPrograms();
  const programNameById = Object.fromEntries(
    programs.map((p) => [p.id, p.name]),
  );
  const programIds = programs.map((p) => p.id);

  let customersQuery = supabase
    .from("customers")
    .select("phone,name,last_seen_at")
    .order("last_seen_at", { ascending: false });
  const term = q?.trim();
  if (term) customersQuery = customersQuery.ilike("phone", `%${term}%`);

  const { data: customersData, error: customersError } = await customersQuery;
  if (customersError)
    throw new Error(`listVendorCustomers: ${customersError.message}`);

  if (programIds.length === 0) {
    return aggregateCustomers(customersData ?? [], [], programNameById);
  }

  const { data: cardsData, error: cardsError } = await supabase
    .from("cards")
    .select("id,phone,program_id,stamp_count,reward_count")
    .in("program_id", programIds);
  if (cardsError) throw new Error(`listVendorCustomers: ${cardsError.message}`);

  const cardIds = (cardsData ?? []).map((c) => c.id);
  const cardPhoneById = Object.fromEntries(
    (cardsData ?? []).map((c) => [c.id, c.phone]),
  );

  let recentExpiredByPhone: Record<string, number> = {};
  if (cardIds.length > 0) {
    const sinceIso = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: vouchersData, error: vouchersError } = await supabase
      .from("reward_vouchers")
      .select("card_id,status,updated_at")
      .in("card_id", cardIds)
      .eq("status", "expired")
      .gte("updated_at", sinceIso);
    if (vouchersError)
      throw new Error(`listVendorCustomers: ${vouchersError.message}`);
    recentExpiredByPhone = countRecentExpiredByPhone(
      vouchersData ?? [],
      cardPhoneById,
      sinceIso,
    );
  }

  return aggregateCustomers(
    customersData ?? [],
    cardsData ?? [],
    programNameById,
    recentExpiredByPhone,
  );
}
```

Note the `cards` select gained `id` (needed to join to `reward_vouchers.card_id`) — `CardFields` itself doesn't need `id` since `aggregateCustomers`'s existing phone-keyed grouping doesn't use it, only the new join step does.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/lib/customers.test.ts`
Expected: PASS (all prior tests — update their expected objects to include `recentExpiredCount: 0` since `aggregateCustomers` now always includes that key — plus the new test)

- [ ] **Step 5: Update `VendorCustomerList` to show the note, and add its test**

In `src/app/dashboard/customers/page.tsx`, in `VendorCustomerList`'s `<li>`:

```tsx
<p className="text-xs text-muted-foreground">
  {customer.totalStamps} total stamps/visits · {customer.totalRewards} reward
  {customer.totalRewards === 1 ? "" : "s"}
  {customer.recentExpiredCount > 0 &&
    ` · +${customer.recentExpiredCount} expired`}
</p>
```

Add to `customers-page.dom.test.tsx`:

```typescript
  it("shows a +N expired note when the customer has recently expired vouchers", () => {
    const withExpired: VendorCustomerRow[] = [
      { ...customers[0], recentExpiredCount: 2 },
    ];
    render(<VendorCustomerList customers={withExpired} />);
    expect(screen.getByText(/\+2 expired/)).toBeInTheDocument();
  });
```

Also add `recentExpiredCount: 0` to the existing `customers` fixture array at the top of the file.

- [ ] **Step 6: Run the dom test**

Run: `pnpm vitest run src/app/dashboard/customers/customers-page.dom.test.tsx`
Expected: PASS

- [ ] **Step 7: Add per-card voucher badges to the program-scoped view**

In `src/app/dashboard/customers/page.tsx`'s program-scoped branch (the `cards.map` block), fetch vouchers for the listed cards and render a small badge row. Add a new function to `src/lib/vouchers.ts` (Task 7's file — this is a small addition, not a new task, since it's the same module):

```typescript
// Impure shell: every voucher for a batch of cards, grouped by card_id.
// Used by the program-scoped Customers page to show each card's reward
// history without an N+1 query.
export async function listVouchersForCards(
  cardIds: string[],
): Promise<Record<string, VoucherRow[]>> {
  if (cardIds.length === 0) return {};
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("reward_vouchers")
    .select(`card_id,${VOUCHER_COLUMNS}`)
    .in("card_id", cardIds)
    .order("earned_at", { ascending: false });
  if (error) throw new Error(`listVouchersForCards: ${error.message}`);
  const byCard: Record<string, VoucherRow[]> = {};
  for (const row of (data ?? []) as (VoucherRow & { card_id: string })[]) {
    const { card_id, ...voucher } = row;
    (byCard[card_id] ??= []).push(voucher);
  }
  return byCard;
}
```

In `page.tsx`, import `listVouchersForCards` and, in the program-scoped branch after `const cards = await listCards(program.id, q);`:

```tsx
const vouchersByCard = await listVouchersForCards(cards.map((c) => c.id));
```

Then in the `<li>` render, after the existing progress `<p>`:

```tsx
{
  (vouchersByCard[card.id] ?? []).length > 0 && (
    <div className="mt-1 flex flex-wrap gap-1">
      {(vouchersByCard[card.id] ?? []).slice(0, 3).map((v) => (
        <Badge
          key={v.id}
          variant={
            v.status === "active"
              ? "default"
              : v.status === "expired"
                ? "destructive"
                : "secondary"
          }
          className="text-[0.65rem]"
        >
          {v.status}
        </Badge>
      ))}
    </div>
  );
}
```

- [ ] **Step 8: Typecheck and run the full test suite**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: PASS

- [ ] **Step 9: Full check**

Run: `pnpm check`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/lib/customers.ts src/lib/vouchers.ts src/app/dashboard/customers/page.tsx test/lib/customers.test.ts src/app/dashboard/customers/customers-page.dom.test.tsx
git commit -m "feat: show reward-voucher history and recent-expiry note on Customers page"
```

---

## Task 12: Stats page — "Expired unclaimed (30d)" tile

**Files:**

- Modify: `src/lib/stats.ts`
- Modify: `src/app/dashboard/stats/page.tsx`
- Test: `test/lib/stats.test.ts`

**Interfaces:**

- Produces: `ProgramStats` gains `expired30d: number`.

- [ ] **Step 1: Write the failing test**

Add to `test/lib/stats.test.ts`:

```typescript
import { countExpired30d } from "@/lib/stats";

// ...(existing describes unchanged above)...

describe("countExpired30d", () => {
  it("counts only expired-status vouchers updated within the last 30 days", () => {
    const vouchers = [
      { status: "expired", updated_at: iso(5) },
      { status: "expired", updated_at: iso(40) }, // outside window
      { status: "redeemed", updated_at: iso(1) },
    ];
    expect(countExpired30d(vouchers, now)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/lib/stats.test.ts`
Expected: FAIL — `countExpired30d` doesn't exist

- [ ] **Step 3: Add the pure function and thread it into both stats shells**

In `src/lib/stats.ts`, add the type field and pure function:

```typescript
export type ProgramStats = {
  enrolled: number;
  newThisWeek: number;
  visitsTotal: number;
  visits30d: number;
  visitsByDay: { date: string; count: number }[];
  rewardsTotal: number;
  rewards30d: number;
  expired30d: number;
  redemptionRate: number;
  repeatVisitRate: number;
  active: number;
  lapsed: number;
  avgVisitsPerCustomer: number;
  visitsDelta: number | null;
  rewardsDelta: number | null;
  activeDelta: number | null;
  avgDaysBetweenVisits: number | null;
};

type VoucherStatsRow = { status: string; updated_at: string };

// Pure: count of vouchers that flipped to 'expired' within the last 30
// days (relative to nowMs). A separate, independently-sourced tile from
// rewards30d/redemptionRate (those stay on stamp_events/chance-win rows —
// see the reward-voucher-ledger design doc's Decisions for why).
export function countExpired30d(
  vouchers: VoucherStatsRow[],
  nowMs: number,
): number {
  const cutoff30d = nowMs - 30 * MS_PER_DAY;
  return vouchers.filter(
    (v) => v.status === "expired" && Date.parse(v.updated_at) >= cutoff30d,
  ).length;
}
```

Update `getProgramStats` to fetch vouchers and include the count:

```typescript
export const getProgramStats = cache(async function getProgramStats(
  programId: string,
): Promise<ProgramStats> {
  const supabase = await createServerClient();
  const nowMs = Date.now();

  const { data: cards, error: cardsError } = await supabase
    .from("cards")
    .select("id,created_at")
    .eq("program_id", programId);
  if (cardsError) throw new Error(`getProgramStats: ${cardsError.message}`);

  const cardIds = (cards ?? []).map((c) => c.id);

  let events: StatsEvent[] = [];
  let vouchers: VoucherStatsRow[] = [];
  if (cardIds.length > 0) {
    const { data, error } = await supabase
      .from("stamp_events")
      .select("card_id,kind,payload,created_at")
      .in("card_id", cardIds);
    if (error) throw new Error(`getProgramStats: ${error.message}`);
    events = data ?? [];

    const { data: voucherData, error: voucherError } = await supabase
      .from("reward_vouchers")
      .select("status,updated_at")
      .in("card_id", cardIds)
      .eq("status", "expired");
    if (voucherError)
      throw new Error(`getProgramStats: ${voucherError.message}`);
    vouchers = voucherData ?? [];
  }

  const { activityEvents, rewardEvents } = classifyActivity(events);
  const cardStats = computeCardStats(
    cards ?? [],
    activityEvents,
    rewardEvents,
    nowMs,
  );
  const visitsByDay = bucketVisitsByDay(activityEvents, nowMs);

  return {
    ...cardStats,
    visitsByDay,
    avgDaysBetweenVisits: avgDaysBetweenVisits(activityEvents),
    expired30d: countExpired30d(vouchers, nowMs),
  };
});
```

Apply the same pattern (fetch `vouchers`, compute `expired30d`) to `getVendorStats`, including its `programIds.length === 0` early-return branch (which should return `expired30d: 0`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/lib/stats.test.ts`
Expected: PASS

- [ ] **Step 5: Add the tile to the stats page**

In `src/app/dashboard/stats/page.tsx`, add a new `<Tile>` in both the vendor-level and program-scoped grids, right after the existing "Rewards redeemed (30d)" tile:

```tsx
              <Tile
                label="Rewards redeemed (30d)"
                value={String(stats.rewards30d)}
                delta={stats.rewardsDelta}
              />
              <Tile
                label="Expired unclaimed (30d)"
                value={String(stats.expired30d)}
              />
```

(Do this in both places this grid appears — the no-`?p=` vendor-level branch and the program-scoped branch.)

- [ ] **Step 6: Typecheck and run the full test suite**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/stats.ts src/app/dashboard/stats/page.tsx test/lib/stats.test.ts
git commit -m "feat: add Expired unclaimed (30d) stats tile"
```

---

## Task 13: Customer-facing `/c` — "Redeem within N days" banner

**Files:**

- Modify: `src/app/c/status-state.ts`
- Modify: `src/app/c/actions.ts`
- Modify: `src/app/c/program-card-status.tsx`
- Test: `src/app/c/program-card-status.dom.test.tsx`

**Interfaces:**

- Consumes: `vendor_join`'s new `voucher_expires_at` column (Task 3); `daysUntilExpiry` (Task 7).
- Produces: `CardStatus` gains `voucherExpiresAt: string | null`.

- [ ] **Step 1: Write the failing test**

Add to `src/app/c/program-card-status.dom.test.tsx`:

```typescript
describe("ProgramCardStatus voucher expiry banner", () => {
  it("shows a redeem-within-N-days banner when the reward is ready and has an expiry", () => {
    const { getByText } = render(
      <ProgramCardStatus
        card={baseCard({
          rewardReady: true,
          voucherExpiresAt: "2026-08-15T00:00:00Z",
        })}
        phone="+6591234567"
      />,
    );
    expect(getByText(/redeem within \d+ days/i)).toBeInTheDocument();
  });

  it("does not show the banner when there's no voucher expiry", () => {
    const { queryByText } = render(
      <ProgramCardStatus
        card={baseCard({ rewardReady: true, voucherExpiresAt: null })}
        phone="+6591234567"
      />,
    );
    expect(queryByText(/redeem within/i)).not.toBeInTheDocument();
  });
});
```

Also add `voucherExpiresAt: null,` to the `baseCard` helper's default object in this file.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/app/c/program-card-status.dom.test.tsx`
Expected: FAIL — `CardStatus` has no `voucherExpiresAt` field (TS error) and the banner text doesn't render

- [ ] **Step 3: Update `status-state.ts`**

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
  carriedOverCount: number | null;
  voucherExpiresAt: string | null;
};
```

- [ ] **Step 4: Update `actions.ts`'s `checkStatusAction`**

Add `voucher_expires_at: string | null;` to the `VendorJoinRow` type, and populate `CardStatus`:

```typescript
type VendorJoinRow = {
  program_id: string;
  name: string;
  type: string;
  config: unknown;
  state: unknown;
  stamp_count: number;
  card_token: string;
  reward_text: string;
  stamps_required: number;
  expiry_days: number | null;
  cycle_started_at: string | null;
  active: boolean;
  replaced_by_name: string | null;
  replaced_by_stamp_count: number | null;
  voucher_expires_at: string | null;
};
```

```typescript
return {
  programId: row.program_id,
  name: row.name,
  label: progress.label,
  view: progress.view,
  rewardReady: progress.rewardReady,
  reward_text: row.reward_text,
  qr,
  expired,
  active: row.active,
  replacedByName: row.replaced_by_name ?? null,
  carriedOverCount:
    row.replaced_by_stamp_count && row.replaced_by_stamp_count > 0
      ? row.replaced_by_stamp_count
      : null,
  voucherExpiresAt: row.voucher_expires_at ?? null,
};
```

- [ ] **Step 5: Update `program-card-status.tsx`**

Add the import and the banner, right after the existing "Reward ready!" block:

```tsx
import { daysUntilExpiry } from "@/lib/vouchers";
```

```tsx
{
  card.rewardReady && (
    <p className="text-sm font-semibold text-gold-accent">🎉 Reward ready!</p>
  );
}
{
  card.rewardReady && card.voucherExpiresAt && (
    <p className="text-xs text-muted-foreground">
      Redeem within {daysUntilExpiry(card.voucherExpiresAt, new Date())} days
    </p>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run src/app/c/program-card-status.dom.test.tsx`
Expected: PASS (all tests in the file, including the 2 new ones)

- [ ] **Step 7: Typecheck and run the full test suite**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: PASS

- [ ] **Step 8: Full check**

Run: `pnpm check`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/app/c/status-state.ts src/app/c/actions.ts src/app/c/program-card-status.tsx src/app/c/program-card-status.dom.test.tsx
git commit -m "feat: show reward-expiry banner on the customer-facing card view"
```

---

## Task 14: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full check**

Run: `pnpm check`
Expected: PASS (prettier --check + eslint + tsc --noEmit)

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: PASS, no skipped/failing tests

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 4: Confirm the migration was applied**

Ask the user to confirm `supabase/migrations/0027_loopkit_reward_vouchers.sql` (Task 3) has been run against the shared Supabase project's SQL editor, if not already confirmed earlier. Nothing in Tasks 4–13 can be exercised end-to-end against a real card until it has.

- [ ] **Step 5: Manual smoke test (if a local/dev environment is available)**

Walk through: create or edit a Stamp program in `/setup` with a short `reward_expiry_days` (e.g. 1), stamp a test card to its threshold at `/dashboard/counter`, confirm the reward-ready state shows an expiry countdown, redeem it and confirm the confirmation dialog and toast behave as expected. Repeat for a Plant program. This step has no pass/fail command — report what was observed.
