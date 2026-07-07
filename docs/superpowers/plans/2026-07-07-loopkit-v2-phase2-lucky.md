# loopkit v2 Phase 2 — Lucky Tap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the **Lucky Tap** template (variable-ratio "some visits instantly win", with a pity ceiling), proving the engine's generic write path — vendors can now create a program of type `stamp` OR `lucky`.

**Architecture:** A generic `record_visit` RPC persists the state the TypeScript strategy computed (Postgres stays dumb). Randomness is **passed into** the pure strategy as an event payload `roll` (server generates it), so `apply` stays deterministic + unit-testable. `/setup` becomes a type picker; the dashboard renders a type-specific counter form. Stamp continues to use its existing `add_stamp` path unchanged (convergence deferred).

**Tech Stack:** Next 16, TypeScript strict, Supabase `@supabase/ssr` (schema `loopkit`), Vitest, pnpm 11. Builds on Phase 1 (`src/lib/engine/*`, migration 0004).

## Global Constraints

- TS strict; no `any`/`@ts-ignore`. No inline comments. Match existing style.
- Randomness enters strategies ONLY via `event.payload.roll` (a number in [0,1)); strategies never call `Math.random()` — keeps them pure/testable. The server action generates the roll.
- Server-side RNG only — never trust a client-supplied roll.
- Schema change = new migration `0005_*` + `src/lib/types.ts` update + a text drift test.
- Every task ends green: `pnpm check && pnpm test && pnpm build`.
- Reuse Phase 1: `Strategy<C,S>`, `EngineEvent` (`{kind, payload?}`), `Progress`, `ProgressView`, `getProgress`, `resolveStampConfig` in `src/lib/engine/`.
- Spec: `docs/superpowers/specs/2026-07-07-loopkit-v2-core-design.md` §3.2.

---

## File Structure

- `supabase/migrations/0005_loopkit_record_visit.sql` (new) — generic `record_visit` RPC.
- `src/lib/types.ts` (modify) — add `record_visit` rpc signature.
- `src/lib/engine/lucky.ts` (new) — `luckyStrategy` (pure).
- `src/lib/engine/index.ts` (modify) — register lucky in `getProgress` + new `applyVisit`.
- `src/app/setup/{page,actions}.tsx/ts` (modify) — type picker + per-type config.
- `src/app/dashboard/page.tsx` (modify) — branch counter by `program.type`.
- `src/app/dashboard/lucky-form.tsx` (new) — the Lucky play form + result.
- `src/app/dashboard/actions.ts` (modify) — `recordVisitAction`.
- Tests: `test/db/record-visit-schema.test.ts`, `test/lib/engine/lucky.test.ts`, `test/lib/engine/apply-visit.test.ts`.

---

### Task 1: Migration 0005 — generic `record_visit` RPC

**Files:** Create `supabase/migrations/0005_loopkit_record_visit.sql`; Modify `src/lib/types.ts`, `docs/DEPLOY.md`; Test `test/db/record-visit-schema.test.ts`.

**Interfaces:**

- Produces RPC `record_visit(p_program uuid, p_phone text, p_state jsonb, p_kind text, p_payload jsonb) returns loopkit.cards` — SECURITY DEFINER, `owns_program`-gated, upserts the card's `state` + `last_event_at` and inserts one event.

- [ ] **Step 1: Failing drift test**

```ts
// test/db/record-visit-schema.test.ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0005_loopkit_record_visit.sql",
  "utf8",
);

describe("0005 record_visit", () => {
  it("defines the SECURITY DEFINER record_visit function", () => {
    expect(sql).toMatch(/create or replace function loopkit\.record_visit\(/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = ''/i);
  });
  it("gates on owns_program", () => {
    expect(sql).toMatch(/owns_program\(p_program\)/i);
  });
  it("upserts the card state and logs an event", () => {
    expect(sql).toMatch(/on conflict \(program_id, phone\) do update/i);
    expect(sql).toMatch(/insert into loopkit\.stamp_events/i);
  });
  it("grants execute to authenticated", () => {
    expect(sql).toMatch(
      /grant execute on function loopkit\.record_visit\(uuid, ?text, ?jsonb, ?text, ?jsonb\) to authenticated/i,
    );
  });
});
```

- [ ] **Step 2: Run → FAIL** (`pnpm vitest run test/db/record-visit-schema.test.ts`) — file not found.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0005_loopkit_record_visit.sql
-- Generic engine write path: the TypeScript strategy computes the new card state;
-- this persists it (state + last_event_at) and logs one event. Vendor-gated via
-- owns_program. Used by non-stamp types (Lucky Tap and later Sprout); the stamp
-- card keeps its existing add_stamp path for now.

create or replace function loopkit.record_visit(
  p_program uuid,
  p_phone   text,
  p_state   jsonb,
  p_kind    text,
  p_payload jsonb
)
returns loopkit.cards
language plpgsql security definer set search_path = '' as $$
declare
  v_card loopkit.cards;
begin
  if not loopkit.owns_program(p_program) then
    raise exception 'not authorized';
  end if;

  insert into loopkit.cards (program_id, phone, state, last_event_at)
    values (p_program, p_phone, p_state, now())
  on conflict (program_id, phone) do update
    set state = excluded.state,
        last_event_at = now(),
        updated_at = now()
  returning * into v_card;

  insert into loopkit.stamp_events (card_id, kind, payload)
    values (v_card.id, p_kind, p_payload);

  return v_card;
end;
$$;

grant execute on function loopkit.record_visit(uuid, text, jsonb, text, jsonb)
  to authenticated, service_role;
```

- [ ] **Step 4: `src/lib/types.ts`** — add to the `Functions` block a `record_visit` entry with Args `{ p_program: string; p_phone: string; p_state: Json; p_kind: string; p_payload: Json }` and Returns the `cards` Row shape (match how existing rpcs like `add_stamp` are typed).

- [ ] **Step 5: `docs/DEPLOY.md`** — add "apply `0005_loopkit_record_visit.sql`".

- [ ] **Step 6: Run → PASS** (4 tests).

- [ ] **Step 7: `pnpm check && pnpm test && pnpm build` green; commit** `feat: 0005 generic record_visit RPC`.

---

### Task 2: Lucky strategy + register in the engine

**Files:** Create `src/lib/engine/lucky.ts`; Modify `src/lib/engine/index.ts`; Test `test/lib/engine/lucky.test.ts`, `test/lib/engine/apply-visit.test.ts`.

**Interfaces:**

- Produces:
  - `type LuckyConfig = { win_probability: number; pity_ceiling: number; cooldown_visits: number; reward_text: string }`
  - `type LuckyState = { visits_since_win: number; total_wins: number }`
  - `const luckyStrategy: Strategy<LuckyConfig, LuckyState>` — `apply` reads `event.payload.roll` (number in [0,1)); a visit **wins** iff `visits_since_win >= cooldown_visits` AND (`visits_since_win + 1 >= pity_ceiling` OR `roll < win_probability`). On win → `visits_since_win=0, total_wins+1, rewardUnlocked=true`; else `visits_since_win+1, rewardUnlocked=false`. `redeem` returns state unchanged (the win is consumed at the counter; no stored balance). `progress` → `{ stage: 'play', label: 'Tap to play — win by visit N', view:{kind:'dots',filled: visits_since_win, total: pity_ceiling}, rewardReady: false }` (rewardReady is per-visit, surfaced via apply's result, not stored).
  - In `index.ts`: `applyVisit(program, card, event, now): { state; rewardUnlocked }` branching on `program.type`; extend `getProgress` switch with `case 'lucky'`; add `resolveLuckyConfig`/`resolveLuckyState` (config JSON / state JSON, defaulting when empty).

- [ ] **Step 1: Failing tests**

```ts
// test/lib/engine/lucky.test.ts
import { describe, it, expect } from "vitest";
import { luckyStrategy } from "@/lib/engine/lucky";

const cfg = {
  win_probability: 0.2,
  pity_ceiling: 8,
  cooldown_visits: 1,
  reward_text: "free topping",
};
const now = new Date("2026-07-07T00:00:00Z");
const visit = (roll: number) => ({ kind: "visit" as const, payload: { roll } });

describe("luckyStrategy", () => {
  it("wins when roll is under the probability and cooldown satisfied", () => {
    const r = luckyStrategy.apply(
      visit(0.05),
      { visits_since_win: 3, total_wins: 0 },
      cfg,
      now,
    );
    expect(r.rewardUnlocked).toBe(true);
    expect(r.state).toEqual({ visits_since_win: 0, total_wins: 1 });
  });
  it("loses when roll is above the probability", () => {
    const r = luckyStrategy.apply(
      visit(0.9),
      { visits_since_win: 3, total_wins: 0 },
      cfg,
      now,
    );
    expect(r.rewardUnlocked).toBe(false);
    expect(r.state).toEqual({ visits_since_win: 4, total_wins: 0 });
  });
  it("cannot win two in a row (cooldown)", () => {
    const r = luckyStrategy.apply(
      visit(0.0),
      { visits_since_win: 0, total_wins: 1 },
      cfg,
      now,
    );
    expect(r.rewardUnlocked).toBe(false);
    expect(r.state.visits_since_win).toBe(1);
  });
  it("guarantees a win at the pity ceiling regardless of roll", () => {
    const r = luckyStrategy.apply(
      visit(0.99),
      { visits_since_win: 7, total_wins: 0 },
      cfg,
      now,
    );
    expect(r.rewardUnlocked).toBe(true);
    expect(r.state.visits_since_win).toBe(0);
  });
});
```

```ts
// test/lib/engine/apply-visit.test.ts
import { describe, it, expect } from "vitest";
import { applyVisit } from "@/lib/engine";

const now = new Date("2026-07-07T00:00:00Z");

describe("applyVisit", () => {
  it("routes a lucky program to the lucky strategy", () => {
    const program = {
      type: "lucky",
      config: {
        win_probability: 0.2,
        pity_ceiling: 8,
        cooldown_visits: 1,
        reward_text: "free topping",
      },
      stamps_required: 0,
      reward_text: "free topping",
    };
    const card = {
      state: { visits_since_win: 7, total_wins: 0 },
      stamp_count: 0,
      reward_count: 0,
    };
    const r = applyVisit(
      program,
      card,
      { kind: "visit", payload: { roll: 0.99 } },
      now,
    );
    expect(r.rewardUnlocked).toBe(true);
    expect(r.state).toEqual({ visits_since_win: 0, total_wins: 1 });
  });
  it("routes a stamp program to the stamp strategy", () => {
    const program = {
      type: "stamp",
      config: { stamps_required: 5, reward_text: "x" },
      stamps_required: 5,
      reward_text: "x",
    };
    const card = { state: { stamp_count: 4 }, stamp_count: 4, reward_count: 0 };
    const r = applyVisit(program, card, { kind: "visit" }, now);
    expect(r.rewardUnlocked).toBe(true);
    expect((r.state as { stamp_count: number }).stamp_count).toBe(5);
  });
});
```

- [ ] **Step 2: Run → FAIL** (modules/exports missing).

- [ ] **Step 3: Write `src/lib/engine/lucky.ts`**

```ts
import type { Strategy } from "@/lib/engine/types";

export type LuckyConfig = {
  win_probability: number;
  pity_ceiling: number;
  cooldown_visits: number;
  reward_text: string;
};
export type LuckyState = { visits_since_win: number; total_wins: number };

export const luckyStrategy: Strategy<LuckyConfig, LuckyState> = {
  defaults() {
    return { visits_since_win: 0, total_wins: 0 };
  },
  progress(state, config) {
    return {
      stage: "play",
      label: `Tap to play — win by visit ${config.pity_ceiling}`,
      view: {
        kind: "dots",
        filled: Math.min(state.visits_since_win, config.pity_ceiling),
        total: config.pity_ceiling,
      },
      rewardReady: false,
    };
  },
  apply(event, state, config) {
    if (event.kind !== "visit") return { state, rewardUnlocked: false };
    const roll =
      typeof event.payload?.roll === "number" ? event.payload.roll : 1;
    const eligible = state.visits_since_win >= config.cooldown_visits;
    const pity = state.visits_since_win + 1 >= config.pity_ceiling;
    const won = eligible && (pity || roll < config.win_probability);
    if (won) {
      return {
        state: { visits_since_win: 0, total_wins: state.total_wins + 1 },
        rewardUnlocked: true,
      };
    }
    return {
      state: { ...state, visits_since_win: state.visits_since_win + 1 },
      rewardUnlocked: false,
    };
  },
  redeem(state) {
    return state;
  },
};
```

- [ ] **Step 4: Extend `src/lib/engine/index.ts`** — add lucky config/state resolvers + `applyVisit` + the `getProgress` lucky case:

```ts
import {
  luckyStrategy,
  type LuckyConfig,
  type LuckyState,
} from "@/lib/engine/lucky";
import type { EngineEvent } from "@/lib/engine/types";

function resolveLuckyConfig(program: ProgramLike): LuckyConfig {
  return program.config as LuckyConfig;
}
function resolveLuckyState(card: CardLike): LuckyState {
  return hasKeys(card.state)
    ? (card.state as LuckyState)
    : luckyStrategy.defaults();
}

export function applyVisit(
  program: ProgramLike,
  card: CardLike,
  event: EngineEvent,
  now: Date,
): { state: unknown; rewardUnlocked: boolean } {
  switch (program.type) {
    case "lucky":
      return luckyStrategy.apply(
        event,
        resolveLuckyState(card),
        resolveLuckyConfig(program),
        now,
      );
    case "stamp":
    default:
      return stampStrategy.apply(
        event,
        resolveStampState(card),
        resolveStampConfig(program),
        now,
      );
  }
}
```

Add `case "lucky": return luckyStrategy.progress(resolveLuckyState(card), resolveLuckyConfig(program), now);` to `getProgress`. (Note: `resolveStampState` must be exported or reused — keep it module-private and reference within the same file.)

- [ ] **Step 5: Run → PASS.** Then `pnpm check && pnpm test && pnpm build` green; commit `feat: lucky strategy + engine applyVisit`.

---

### Task 3: `/setup` type picker + per-type config

**Files:** Modify `src/app/setup/page.tsx`, `src/app/setup/actions.ts` (read `program.ts` for the schema).

**Interfaces:** `saveProgramAction` writes `type` + a `config` JSON (stamp: `{stamps_required, reward_text}`; lucky: `{win_probability, pity_ceiling, cooldown_visits, reward_text}`), plus keeps writing the legacy `stamps_required`/`reward_text` columns for stamp (compat).

- [ ] **Step 1:** Add a **type selector** to `setup/page.tsx` — a `type` field (radio/segmented: "Stamp card" / "Lucky Tap"), defaulting to the program's current type or `stamp`. Below it, render the stamp fields (name, stamps_required, reward) when stamp, and the lucky fields (name, reward, win chance %, "guaranteed win by" = pity_ceiling) when lucky. Keep the existing visual style (Label + Input, rounded-xl). A small client component `setup-form.tsx` is acceptable to toggle fields by selected type; match existing markup.

- [ ] **Step 2:** Extend `src/app/setup/actions.ts` `saveProgramAction` — a Zod discriminated union on `type`:
  - `stamp`: `{ type:'stamp', name, stamps_required:2..20, reward_text }`.
  - `lucky`: `{ type:'lucky', name, reward_text, win_probability: 0.02..1 (from a percent field /100), pity_ceiling: 2..20, cooldown_visits: default 1 }`.
    Build `config` accordingly; upsert the program with `type` + `config` (+ legacy `stamps_required`/`reward_text` when stamp; for lucky set `stamps_required` to a valid placeholder like the pity_ceiling to satisfy the NOT NULL 2..20 check, and `reward_text` from the form). Validate with `safeParse`; keep the existing redirect-to-dashboard behavior.

- [ ] **Step 3:** `pnpm check && pnpm test && pnpm build` green; add/adjust any setup action test; commit `feat: setup type picker (stamp | lucky)`.

---

### Task 4: Dashboard type-aware counter + Lucky play

**Files:** Modify `src/app/dashboard/page.tsx`, `src/app/dashboard/actions.ts`; Create `src/app/dashboard/lucky-form.tsx`.

**Interfaces:** `recordVisitAction(formData) : Promise<ActionResult<{ won: boolean; reward_text: string; phone: string }>>` — vendor-gated; for the program's type it reads the current card (cookie client, `cards_own`), computes `applyVisit` with `{kind:'visit', payload:{roll: Math.random()}}`, persists via the `record_visit` RPC (kind `'visit'`, payload `{won, roll}`), returns whether this visit won.

- [ ] **Step 1:** Add `recordVisitAction` to `dashboard/actions.ts`:

```ts
export async function recordVisitAction(
  formData: FormData,
): Promise<ActionResult<{ won: boolean; reward_text: string; phone: string }>> {
  await requireVendor();
  const program = await getProgram();
  if (!program) return { success: false, error: "Set up your card first." };
  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok)
    return { success: false, error: "Enter a valid Singapore phone number." };

  const supabase = await createServerClient();
  const { data: existing } = await supabase
    .from("cards")
    .select("id,phone,stamp_count,reward_count,state")
    .eq("program_id", program.id)
    .eq("phone", normalized.phone)
    .maybeSingle();

  const card = existing ?? { state: {}, stamp_count: 0, reward_count: 0 };
  const event = { kind: "visit" as const, payload: { roll: Math.random() } };
  const { state, rewardUnlocked } = applyVisit(
    program,
    card,
    event,
    new Date(),
  );

  const { error } = await supabase.rpc("record_visit", {
    p_program: program.id,
    p_phone: normalized.phone,
    p_state: state as never,
    p_kind: "visit",
    p_payload: { won: rewardUnlocked, roll: event.payload.roll } as never,
  });
  if (error) {
    console.error("record_visit failed", error.message);
    return { success: false, error: "Something went wrong. Try again." };
  }

  revalidatePath("/dashboard");
  return {
    success: true,
    won: rewardUnlocked,
    reward_text:
      (program.config as { reward_text?: string })?.reward_text ??
      program.reward_text,
    phone: normalized.phone,
  };
}
```

(Imports: `applyVisit` from `@/lib/engine`.)

- [ ] **Step 2:** Create `dashboard/lucky-form.tsx` (`"use client"`) modeled on `stamp-form.tsx`: a phone input + "Play" button (`useAsyncAction`, "Playing…" pending), calls `recordVisitAction`; on `won` → confetti/celebration + toast "🎉 <phone> won <reward>!" and a highlighted result card; on lose → a gentle "No win this time" toast + result; clear + refocus the phone field after each play; `router.refresh()`.

- [ ] **Step 3:** In `dashboard/page.tsx`, branch the "Stamp a customer" card by `program.type`: `type === 'lucky'` → render `<LuckyForm/>` (heading "Play a round"); else `<StampForm/>` (unchanged). The Look-up and Recent-activity sections stay; recent-activity already reads `stamp_events` (now includes `visit`/`win` kinds — render "Visit" / "Won" labels for those).

- [ ] **Step 4:** `pnpm check && pnpm test && pnpm build` green; commit `feat: dashboard Lucky Tap play + type-aware counter`.

---

## Self-Review

**Spec coverage (§3.2):** win_probability/pity_ceiling/cooldown ✓ (Task 2); server-side RNG via event roll, never client ✓ (Task 2 constraint + Task 4 action); prize kept as single `reward_text` (YAGNI vs the spec's weighted pool — noted, add pool later); variable-ratio + pity ✓. Generic write path (`record_visit`) ✓ (Task 1). Type picker ✓ (Task 3). Type-aware counter ✓ (Task 4). Stamp path untouched ✓.

**Placeholder scan:** UI steps (Task 3 Step 1, Task 4 Step 2) are directive prose but name exact files, fields, behaviors, and the model component (`stamp-form.tsx`/`setup/page.tsx`) to mirror — no vague "handle edge cases".

**Type consistency:** `LuckyConfig`/`LuckyState`, `applyVisit`, `recordVisitAction` `ActionResult<{won,reward_text,phone}>`, `event.payload.roll` used consistently across Tasks 2–4. `record_visit(uuid,text,jsonb,text,jsonb)` signature matches between migration, types.ts, and the action call.
