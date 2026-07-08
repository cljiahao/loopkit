# loopkit Phase W2 — Chance engine: 🎡 Spin-the-Wheel + 🎟️ Scratch Card — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Two new program types sharing one weighted-outcome "chance" strategy — Spin-the-Wheel (visible wheel) and Scratch Card (scratch reveal) — generalizing Lucky Tap's proven server-random pattern from binary win/lose to N weighted prize segments.

**Architecture:** One pure `chanceStrategy(kind)` factory in `src/lib/engine/chance.ts` mirrors `lucky.ts`'s shape (server `payload.roll`, optional pity ceiling, cooldown) but picks among **weighted segments** instead of a binary outcome. A shared `ProgressView` variant (`kind:"chance"`) carries `variant:"wheel"|"scratch"`, the segment list, and the last-landed segment id (persisted in state) so the UI can render a reveal. Reuses `record_visit`/`applyVisit`/`getProgress` — no new RPC.

**Tech Stack:** Next 16, TS strict, Supabase (schema `loopkit`), Vitest, pnpm 11. Builds on the full engine (`src/lib/engine/{types,index,lucky,plant}.ts`).

## Global Constraints

- TS strict; no `any`/`@ts-ignore`; no inline comments; match existing style.
- Randomness ONLY via server-generated `event.payload.roll` (never client) — same rule as Lucky Tap.
- Segments always include at least one non-reward ("Try again") option unless every segment has a reward — vendor configures this in `/setup`.
- Schema change → migration `0010_*` (widen the `programs.type` check) + `src/lib/types.ts` + drift test.
- Every task ends green: `pnpm check && pnpm test && pnpm build`.
- Spec: `docs/superpowers/specs/2026-07-08-loopkit-counter-first-design.md` Part 3 (Wave 0).

---

### Task 1: Migration 0010 — widen `programs.type`

**Files:** Create `supabase/migrations/0010_loopkit_chance_types.sql`; Modify `src/lib/types.ts`, `docs/DEPLOY.md`; Test `test/db/chance-types-schema.test.ts`.

- [ ] Drift test asserting the new check constraint includes `wheel` and `scratch` alongside the existing three.
- [ ] Migration:

```sql
-- supabase/migrations/0010_loopkit_chance_types.sql
-- Widen programs.type to admit the two chance-based templates (wheel, scratch).
-- They share one weighted-outcome strategy in TypeScript; no new tables/RPCs —
-- record_visit (0005) already persists arbitrary per-type state.
alter table loopkit.programs drop constraint if exists programs_type_check;
alter table loopkit.programs
  add constraint programs_type_check
  check (type in ('stamp','lucky','plant','wheel','scratch'));
```

- [ ] `src/lib/types.ts`: widen the `type` literal/check comment if one exists (the column is `text`, so likely no type-level change needed beyond a comment — verify). `docs/DEPLOY.md`: add apply-0010 step.
- [ ] PASS; `pnpm check && pnpm test && pnpm build` green; commit `feat: 0010 widen programs.type for wheel/scratch`.

### Task 2: `chanceStrategy` — pure weighted-pick engine

**Files:** Create `src/lib/engine/chance.ts`; Modify `src/lib/engine/types.ts` (new `ProgressView` variant); Test `test/lib/engine/chance.test.ts`.

**Interfaces:**

- `ProgressView` gains: `{ kind: "chance"; variant: "wheel" | "scratch"; segments: { id: string; label: string; reward: boolean }[]; landedId: string | null }`.
- `type ChanceSegment = { id: string; label: string; weight: number; reward_text?: string }`.
- `type ChanceConfig = { variant: "wheel" | "scratch"; segments: ChanceSegment[]; pity_ceiling?: number; cooldown_visits: number; reward_text: string }`.
- `type ChanceState = { visits_since_win: number; total_wins: number; landed_segment_id: string | null }`.
- `function makeChanceStrategy(variant: "wheel" | "scratch"): Strategy<ChanceConfig, ChanceState>` — exported; also export `wheelStrategy = makeChanceStrategy("wheel")` and `scratchStrategy = makeChanceStrategy("scratch")`.
- Pure helper `pickSegment(segments: ChanceSegment[], roll: number, forceReward: boolean): ChanceSegment` — cumulative-weight selection over `roll ∈ [0,1)`; when `forceReward` is true, restrict the pool to segments with `reward_text` (falls back to all segments if none have a reward, to avoid an infinite/empty pool).

- [ ] **Failing tests** (`test/lib/engine/chance.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import {
  pickSegment,
  makeChanceStrategy,
  type ChanceConfig,
} from "@/lib/engine/chance";

describe("pickSegment", () => {
  const segs = [
    { id: "a", label: "Try again", weight: 6 },
    { id: "b", label: "10% off", weight: 3, reward_text: "10% off" },
    { id: "c", label: "Free drink", weight: 1, reward_text: "a free drink" },
  ];
  it("picks by cumulative weight (deterministic on roll)", () => {
    expect(pickSegment(segs, 0.0, false).id).toBe("a");
    expect(pickSegment(segs, 0.65, false).id).toBe("b");
    expect(pickSegment(segs, 0.95, false).id).toBe("c");
    expect(pickSegment(segs, 0.999, false).id).toBe("c");
  });
  it("restricts to reward segments when forced", () => {
    const picked = pickSegment(segs, 0.0, true);
    expect(picked.reward_text).toBeDefined();
  });
  it("falls back to the full pool if no segment has a reward", () => {
    const noReward = [{ id: "x", label: "Try again", weight: 1 }];
    expect(pickSegment(noReward, 0.5, true).id).toBe("x");
  });
});

describe("chanceStrategy (wheel)", () => {
  const cfg: ChanceConfig = {
    variant: "wheel",
    segments: [
      { id: "a", label: "Try again", weight: 5 },
      { id: "b", label: "Free item", weight: 1, reward_text: "a free item" },
    ],
    pity_ceiling: 5,
    cooldown_visits: 0,
    reward_text: "a free item",
  };
  const now = new Date("2026-07-08T00:00:00Z");
  const strategy = makeChanceStrategy("wheel");

  it("defaults to no spins yet", () => {
    expect(strategy.defaults(cfg)).toEqual({
      visits_since_win: 0,
      total_wins: 0,
      landed_segment_id: null,
    });
  });
  it("lands + wins on a low roll matching the reward segment's slice", () => {
    const r = strategy.apply(
      { kind: "visit", payload: { roll: 0.99 } },
      { visits_since_win: 0, total_wins: 0, landed_segment_id: null },
      cfg,
      now,
    );
    expect(r.rewardUnlocked).toBe(true);
    expect(r.state.landed_segment_id).toBe("b");
  });
  it("forces a reward segment at the pity ceiling regardless of roll", () => {
    const r = strategy.apply(
      { kind: "visit", payload: { roll: 0.0 } },
      { visits_since_win: 4, total_wins: 0, landed_segment_id: null },
      cfg,
      now,
    );
    expect(r.rewardUnlocked).toBe(true);
  });
  it("progress exposes the segment list + last landed id", () => {
    const p = strategy.progress(
      { visits_since_win: 1, total_wins: 1, landed_segment_id: "b" },
      cfg,
      now,
    );
    expect(p.view).toMatchObject({
      kind: "chance",
      variant: "wheel",
      landedId: "b",
    });
    expect(p.view.segments).toHaveLength(2);
  });
});
```

- [ ] Extend `ProgressView` in `src/lib/engine/types.ts` with the `chance` variant (a 3-member union alongside `dots`/`plant`).
- [ ] Implement `pickSegment` + `makeChanceStrategy` in `src/lib/engine/chance.ts`:
  - `pickSegment(segments, roll, forceReward)`: pool = `forceReward ? (segments.filter(s=>s.reward_text).length ? segments.filter(s=>s.reward_text) : segments) : segments`; total = sum of pool weights; walk cumulative `acc += w/total` until `roll < acc`, return that segment (last as fallback for float edge).
  - `defaults`: `{ visits_since_win: 0, total_wins: 0, landed_segment_id: null }`.
  - `apply`: `roll = payload?.roll ?? 1`; `eligible = visits_since_win >= cooldown_visits`; `forcePity = pity_ceiling != null && eligible && visits_since_win + 1 >= pity_ceiling`; `segment = pickSegment(config.segments, roll, forcePity)`; `won = eligible && !!segment.reward_text` (a segment landed on outside eligibility, e.g. cooldown active, always lands on a non-reward segment — pick only from non-reward segments when `!eligible`, mirroring lucky's cooldown gate); persist `landed_segment_id: segment.id`, reset `visits_since_win` to 0 on win else `+1`.
  - `progress`: `view = { kind:"chance", variant, segments: config.segments.map(s=>({id,label,reward:!!s.reward_text})), landedId: state.landed_segment_id }`; `label` = "Spin to play" (wheel) / "Scratch to reveal" (scratch); `rewardReady: false` (chance rewards are instant, consumed the moment of the visit — no banked redeem state, matching Lucky).
  - `redeem`: return state unchanged (nothing to redeem — same as Lucky).
- [ ] Register both in `src/lib/engine/index.ts`: `resolveChanceConfig`/`resolveChanceState` (config/state JSON with `makeChanceStrategy(variant).defaults` fallback), `case "wheel"`/`case "scratch"` in both `applyVisit` and `getProgress`, dispatching to `makeChanceStrategy(program.type as "wheel"|"scratch")`.
- [ ] Tests PASS; `pnpm check && pnpm test && pnpm build` green; commit `feat: chance strategy (wheel + scratch)`.

### Task 3: `/setup` — Wheel + Scratch options

**Files:** Modify `src/app/setup/setup-form.tsx`, `src/lib/program.ts` (schema), `src/app/setup/actions.ts`.

- [ ] Extend `saveProgramSchema` with two members `{type:'wheel'|'scratch', name, reward_text, segments: array of {label, weight, is_reward} min 2 max 6, pity_ceiling?: 2..20}`. Keep it simple for v1: a fixed 2-segment default the vendor can edit (label+weight per row) via a small repeatable field group in `setup-form.tsx` (mirror the existing per-type conditional rendering pattern already used for stamp/lucky/plant).
- [ ] `saveProgramAction`: for `wheel`/`scratch`, build `config: {variant: type, segments: [...with generated ids...], pity_ceiling, cooldown_visits: 0, reward_text}`, `stamps_required` = a satisfied-placeholder (e.g. `pity_ceiling ?? 10`, matching the existing NOT NULL 2..20 constraint pattern used for lucky/plant).
- [ ] Green; commit `feat: /setup Wheel + Scratch program types`.

### Task 4: Counter + `/c` reveal UI

**Files:** Create `src/components/wheel.tsx`, `src/components/scratch-card.tsx`; Modify `src/app/dashboard/serve-customer.tsx`, `src/app/c/check-form.tsx`.

- [ ] `<Wheel segments landedId spinning? className>`: an inline-SVG circular wheel divided into `segments.length` arcs (label each), with a CSS-rotation animation that lands on `landedId`'s arc when it changes (reduced-motion: snap, no spin). Mirror `<Plant>`'s self-contained-SVG-component pattern (no dependency).
- [ ] `<ScratchCard revealed label reward>`: a simple reveal — a covered card that flips/reveals the landed segment's label + reward-or-not styling (gold if reward) on tap/on-mount; reduced-motion: show immediately.
- [ ] `serve-customer.tsx`: add a `"wheel"`/`"scratch"` `ServeResult` mode (mirror the `lucky` mode's shape: `{mode:"chance", phone, view, wonThisTime, rewardText}` read from `recordVisitAction`'s returned `progress.view`); render `<Wheel>` or `<ScratchCard>` per `view.variant` in the result block; primary-button copy: "Spin" / "Scratch".
- [ ] `c/check-form.tsx`: when `view.kind === "chance"`, render the same components (read-only reveal of the last spin) instead of dots/plant.
- [ ] Green; commit `feat: wheel + scratch counter and customer UI`.

---

## Self-Review

**Spec coverage (Part 3, Wave 0):** shared chance engine generalizing Lucky's server-roll pattern (Task 2); Wheel + Scratch as two program types (Task 1, 3); reveal UI for both (Task 4). No new RPC — reuses `record_visit`/`applyVisit`/`getProgress`. Anti-fraud posture matches Lucky (server-only roll).

**Placeholder scan:** `pickSegment`/`makeChanceStrategy` fully specified with exact logic; UI tasks name exact components/props, mirroring `<Plant>`'s established pattern.

**Type consistency:** `ChanceConfig`/`ChanceState`/`ProgressView` "chance" variant used consistently Tasks 2–4; `program.type` literal `"wheel"|"scratch"` threaded from setup through engine dispatch to UI `variant`.
