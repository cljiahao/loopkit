# loopkit v2 Phase 4 — 🌱 Sprout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Ship the flagship **Sprout** template: a loyalty card that is a living plant — visits grow it through stages to **Bloom** (the reward); staying away wilts it (gently, never dies). The plant is the visible progress in both the vendor dashboard and the customer `/c` view.

**Architecture:** A pure `plantStrategy` where **progress is derived on read** — growth decays as a function of time-since-last-visit (grace period + a floor so it never dies), computed from `last_visit_at` stored _in the plant state_ (self-contained, no extra params, no cron). Rendering uses a new `ProgressView` **`plant`** variant + a lightweight SVG `<Plant>`. Reuses the generic `record_visit` write path (0005) via `recordVisitAction`.

**Tech Stack:** Next 16, TS strict, Supabase (schema `loopkit`), Vitest, pnpm 11. Builds on Phases 1–3 (engine, `record_visit`, `applyVisit`, `getProgress`, customer `/c`). No migration.

## Global Constraints

- TS strict; no `any`/`@ts-ignore`; no inline comments; match existing style.
- Progress is DERIVED — never store a live growth number; recompute from `state.growth` + `state.last_visit_at` + `now`. `plantStrategy` is pure (all time via the `now: Date` arg).
- Wilt **floors and never dies**: decayed growth never drops below `min(currentGrowth, floor_growth)`; a grace period means normal-cadence regulars never wilt.
- `Math.random()`/wall-clock live only in server actions; strategies get `now` passed in.
- Stamp/lucky untouched and green. Reuse `record_visit` (0005) — no new migration.
- Plant art = inline SVG (offline-safe, fast), reduced-motion respected.
- Every task ends green: `pnpm check && pnpm test && pnpm build`.
- Spec: `docs/superpowers/specs/2026-07-07-loopkit-v2-core-design.md` §3.3.

---

## File Structure

- `src/lib/engine/types.ts` (modify) — extend `ProgressView` with a `plant` variant.
- `src/lib/engine/plant.ts` (new) — `plantStrategy` + decay helpers (pure).
- `src/lib/engine/index.ts` (modify) — register plant in `getProgress` + `applyVisit`; add `'plant'` to the type union usages.
- `src/components/plant.tsx` (new) — `<Plant stage wilting />` SVG.
- `src/app/setup/{page(setup-form),actions}.tsx/ts` (modify) — Sprout option + config derivation.
- `src/app/dashboard/actions.ts` (modify) — generalize `recordVisitAction` return to carry `progress` + `rewardUnlocked`.
- `src/app/dashboard/plant-form.tsx` (new) — "water" form + plant render + bloom celebration.
- `src/app/dashboard/lucky-form.tsx` (modify) — read `rewardUnlocked` instead of `won`.
- `src/app/dashboard/page.tsx` (modify) — branch to `<PlantForm>` for `type==='plant'`.
- `src/app/c/check-form.tsx` (modify) — render `<Plant>` when `view.kind==='plant'`.
- Tests: `test/lib/engine/plant.test.ts`, `test/lib/engine/plant-apply-visit.test.ts`.

---

### Task 1: `ProgressView` plant variant + `plantStrategy`

**Files:** Modify `src/lib/engine/types.ts`, `src/lib/engine/index.ts`; Create `src/lib/engine/plant.ts`; Test `test/lib/engine/plant.test.ts`, `test/lib/engine/plant-apply-visit.test.ts`.

**Interfaces:**

- `ProgressView = { kind:'dots'; filled:number; total:number } | { kind:'plant'; stage:number; stageName:string; totalStages:number; wilting:boolean }`.
- `PlantStage = { name:string; threshold:number }`; `PlantConfig = { stages:PlantStage[]; growth_per_visit:number; grace_days:number; decay_rate:number; floor_growth:number; reward_text:string }`; `PlantState = { growth:number; last_visit_at:string|null; blooms:number }`.
- `plantStrategy: Strategy<PlantConfig, PlantState>`.
- `applyVisit`/`getProgress` gain a `case 'plant'`.

- [ ] **Step 1: Extend `ProgressView` in `src/lib/engine/types.ts`**

```ts
export type ProgressView =
  | { kind: "dots"; filled: number; total: number }
  | {
      kind: "plant";
      stage: number;
      stageName: string;
      totalStages: number;
      wilting: boolean;
    };
```

Run `pnpm check` — expect a tsc error at the `/c` `check-form.tsx` (and anywhere reading `view.filled` without narrowing). Fix those consumers to narrow on `view.kind === "dots"` before reading `filled`/`total` (Task 5 handles `/c`; for now guard so it compiles). Note the existing `stampStrategy`/`luckyStrategy` still return `{kind:'dots',...}` — unaffected.

- [ ] **Step 2: Failing tests**

```ts
// test/lib/engine/plant.test.ts
import { describe, it, expect } from "vitest";
import { plantStrategy, type PlantConfig } from "@/lib/engine/plant";

const cfg: PlantConfig = {
  stages: [
    { name: "Seed", threshold: 0 },
    { name: "Sprout", threshold: 2 },
    { name: "Leafing", threshold: 4 },
    { name: "Budding", threshold: 6 },
    { name: "Bloom", threshold: 8 },
  ],
  growth_per_visit: 1,
  grace_days: 5,
  decay_rate: 0.5,
  floor_growth: 2,
  reward_text: "free kopi",
};
const at = (s: string) => new Date(s);
const day0 = at("2026-07-01T00:00:00Z");

describe("plantStrategy", () => {
  it("starts as a seed", () => {
    expect(plantStrategy.defaults(cfg)).toEqual({
      growth: 0,
      last_visit_at: null,
      blooms: 0,
    });
  });
  it("grows one step per visit and stamps last_visit_at", () => {
    const r = plantStrategy.apply(
      { kind: "visit" },
      { growth: 3, last_visit_at: day0.toISOString(), blooms: 0 },
      cfg,
      day0,
    );
    expect(r.state.growth).toBe(4);
    expect(r.state.last_visit_at).toBe(day0.toISOString());
  });
  it("does not wilt within the grace period", () => {
    const p = plantStrategy.progress(
      { growth: 6, last_visit_at: day0.toISOString(), blooms: 0 },
      cfg,
      at("2026-07-05T00:00:00Z"),
    );
    expect(p.view).toMatchObject({ kind: "plant", wilting: false });
    expect(p.stage).toBe("Budding");
  });
  it("wilts after grace but never below the floor", () => {
    const p = plantStrategy.progress(
      { growth: 6, last_visit_at: day0.toISOString(), blooms: 0 },
      cfg,
      at("2026-07-30T00:00:00Z"),
    );
    expect(p.view).toMatchObject({ kind: "plant", wilting: true });
    expect(p.stage).toBe("Sprout");
  });
  it("blooms when a visit reaches the top threshold", () => {
    const r = plantStrategy.apply(
      { kind: "visit" },
      { growth: 7, last_visit_at: day0.toISOString(), blooms: 0 },
      cfg,
      day0,
    );
    expect(r.rewardUnlocked).toBe(true);
    expect(plantStrategy.progress(r.state, cfg, day0).rewardReady).toBe(true);
  });
  it("redeem resets to a seed and counts the bloom", () => {
    const s = plantStrategy.redeem(
      { growth: 8, last_visit_at: day0.toISOString(), blooms: 1 },
      cfg,
    );
    expect(s.growth).toBe(0);
    expect(s.blooms).toBe(2);
  });
});
```

```ts
// test/lib/engine/plant-apply-visit.test.ts
import { describe, it, expect } from "vitest";
import { applyVisit, getProgress } from "@/lib/engine";

const program = {
  type: "plant",
  config: {
    stages: [
      { name: "Seed", threshold: 0 },
      { name: "Sprout", threshold: 2 },
      { name: "Bloom", threshold: 4 },
    ],
    growth_per_visit: 1,
    grace_days: 5,
    decay_rate: 0.5,
    floor_growth: 2,
    reward_text: "x",
  },
  stamps_required: 4,
  reward_text: "x",
};
const now = new Date("2026-07-01T00:00:00Z");

describe("plant via engine", () => {
  it("routes plant visits + progress through the plant strategy", () => {
    const card = {
      state: { growth: 3, last_visit_at: now.toISOString(), blooms: 0 },
      stamp_count: 0,
      reward_count: 0,
    };
    const r = applyVisit(program, card, { kind: "visit" }, now);
    expect(r.rewardUnlocked).toBe(true);
    const p = getProgress(program, { ...card, state: r.state }, now);
    expect(p.view.kind).toBe("plant");
  });
});
```

- [ ] **Step 3: Write `src/lib/engine/plant.ts`**

```ts
import type { Strategy } from "@/lib/engine/types";

export type PlantStage = { name: string; threshold: number };
export type PlantConfig = {
  stages: PlantStage[];
  growth_per_visit: number;
  grace_days: number;
  decay_rate: number;
  floor_growth: number;
  reward_text: string;
};
export type PlantState = {
  growth: number;
  last_visit_at: string | null;
  blooms: number;
};

const MS_PER_DAY = 86_400_000;

function decayedGrowth(
  state: PlantState,
  config: PlantConfig,
  now: Date,
): number {
  if (state.last_visit_at === null) return state.growth;
  const idleDays = Math.max(
    0,
    (now.getTime() - new Date(state.last_visit_at).getTime()) / MS_PER_DAY,
  );
  const decayDays = Math.max(0, idleDays - config.grace_days);
  const floor = Math.min(state.growth, config.floor_growth);
  return Math.max(floor, state.growth - config.decay_rate * decayDays);
}

function stageIndexFor(growth: number, stages: PlantStage[]): number {
  let idx = 0;
  for (let i = 0; i < stages.length; i++) {
    if (growth >= stages[i].threshold) idx = i;
  }
  return idx;
}

function bloomThreshold(config: PlantConfig): number {
  return config.stages[config.stages.length - 1].threshold;
}

export const plantStrategy: Strategy<PlantConfig, PlantState> = {
  defaults() {
    return { growth: 0, last_visit_at: null, blooms: 0 };
  },
  progress(state, config, now) {
    const g = decayedGrowth(state, config, now);
    const idx = stageIndexFor(g, config.stages);
    const wilting = g < state.growth;
    return {
      stage: config.stages[idx].name,
      label: wilting ? "Wilting — visit to revive it" : config.stages[idx].name,
      view: {
        kind: "plant",
        stage: idx,
        stageName: config.stages[idx].name,
        totalStages: config.stages.length,
        wilting,
      },
      rewardReady: g >= bloomThreshold(config),
    };
  },
  apply(event, state, config, now) {
    if (event.kind !== "visit") return { state, rewardUnlocked: false };
    const settled = decayedGrowth(state, config, now);
    const bloom = bloomThreshold(config);
    const growth = Math.min(settled + config.growth_per_visit, bloom);
    return {
      state: { growth, last_visit_at: now.toISOString(), blooms: state.blooms },
      rewardUnlocked: settled < bloom && growth >= bloom,
    };
  },
  redeem(state) {
    return {
      growth: 0,
      last_visit_at: state.last_visit_at,
      blooms: state.blooms + 1,
    };
  },
};
```

- [ ] **Step 4: Register in `src/lib/engine/index.ts`** — add `resolvePlantConfig`/`resolvePlantState` (config/state JSON, defaulting via `plantStrategy.defaults`), a `case "plant"` in both `applyVisit` and `getProgress`. Follow the lucky pattern exactly.

- [ ] **Step 5: Run tests → PASS.** `pnpm check && pnpm test && pnpm build` green; commit `feat: plant strategy + progress-view plant variant`.

---

### Task 2: `<Plant>` SVG component

**Files:** Create `src/components/plant.tsx`.

**Interfaces:** `<Plant stage={number} totalStages={number} wilting={boolean} className? />` — renders a lightweight inline-SVG plant whose fullness/height reflects `stage/totalStages`; `wilting` droops it and desaturates (a gold bloom at the top stage). No dependency; `aria-hidden` decorative (the label carries meaning); respects `prefers-reduced-motion` (no transitions under reduce).

- [ ] **Step 1:** Implement a geometric SVG: a pot + a stem that grows taller with `stage`, leaves appearing at higher stages, and a gold `bloom` flower at the final stage. When `wilting`, apply a slight rotation/translate to droop and use muted colors. Use loopkit tokens (`text-primary` stem/leaf, `text-gold` bloom, `text-muted-foreground` for wilt). Keep it a single self-contained component (~60–100 lines). Size ~`size-32` by default, overridable via `className`.

- [ ] **Step 2:** `pnpm check && pnpm build` green (no test needed for pure presentational SVG); commit `feat: Plant svg component`.

---

### Task 3: `/setup` Sprout option + config derivation

**Files:** Modify `src/app/setup/setup-form.tsx`, `src/lib/program.ts` (the `saveProgramSchema` union), `src/app/setup/actions.ts`.

**Interfaces:** A third type option "Sprout — grow a plant". Vendor inputs: card name, reward, and **visits to bloom** (2..20). The action derives the `PlantConfig`: `growth_per_visit=1`, `bloom=visits_to_bloom`, five stages at thresholds `[0, round(b*0.25), round(b*0.5), round(b*0.75), b]` named Seed/Sprout/Leafing/Budding/Bloom, `grace_days=5`, `decay_rate=0.5`, `floor_growth=stages[1].threshold`. Store `stamps_required = visits_to_bloom` (satisfies the 2..20 NOT NULL) and `reward_text`.

- [ ] **Step 1:** Add the Sprout segment to the type picker in `setup-form.tsx`; when selected, show name + reward + a "Visits to bloom" number input (min 2 max 20, default 6). Mirror the existing field styling.
- [ ] **Step 2:** Extend `saveProgramSchema` (discriminated union) with a `plant` member `{ type:'plant', name, reward_text, visits_to_bloom: 2..20 }`. In `saveProgramAction`, build the derived `PlantConfig` (helper `buildPlantConfig(visits_to_bloom, reward_text)`; put it in `src/lib/program.ts` and unit-test it) and upsert with `type:'plant'`, `config`, `stamps_required = visits_to_bloom`, `reward_text`.
- [ ] **Step 3:** Add `test/lib/build-plant-config.test.ts` (thresholds + floor derivation). `pnpm check && pnpm test && pnpm build` green; commit `feat: setup Sprout type + plant config`.

---

### Task 4: Dashboard "water" flow + generalize the visit result

**Files:** Modify `src/app/dashboard/actions.ts`, `src/app/dashboard/lucky-form.tsx`, `src/app/dashboard/page.tsx`; Create `src/app/dashboard/plant-form.tsx`.

**Interfaces:** `recordVisitAction` return becomes `ActionResult<{ rewardUnlocked: boolean; progress: Progress; reward_text: string; phone: string }>` (drop the lucky-specific `won`). It computes `applyVisit` (roll only matters for lucky) AND `getProgress(program, {state: newState,...}, now)` so the client can render the fresh per-type progress.

- [ ] **Step 1:** Update `recordVisitAction`: after the `record_visit` RPC succeeds, compute `const progress = getProgress(programLike, { state: newState, stamp_count: 0, reward_count: 0 }, new Date())` and return `{ success:true, rewardUnlocked, progress, reward_text, phone }`. (Import `getProgress`.)
- [ ] **Step 2:** Update `lucky-form.tsx` to read `res.rewardUnlocked` (was `res.won`) for the win toast/celebration; otherwise unchanged.
- [ ] **Step 3:** Create `plant-form.tsx` (mirror `lucky-form.tsx` + reuse `ScanButton` + `phoneRef`/`formRef`): phone input + "Water" button ("Watering…" pending) → `recordVisitAction` → render `<Plant stage=... wilting=... />` from `res.progress.view` (narrow `kind==='plant'`) + the stage label; on `rewardUnlocked` → a gold "🌻 Bloomed! {reward} unlocked" celebration + `RedeemButton`-style confirm (reuse the redeem flow: redeem resets the plant). Clear + refocus phone after each water; `router.refresh()`.
- [ ] **Step 4:** In `page.tsx`, branch the counter: `type==='plant'` → `<PlantForm/>` (heading "Water a plant"); keep stamp/lucky branches. Recent-activity labels already handle `visit`.
- [ ] **Step 5:** `pnpm check && pnpm test && pnpm build` green; update any dashboard test touched by the return-shape change; commit `feat: dashboard Sprout water flow + generalized visit result`.

---

### Task 5: `/c` renders the plant

**Files:** Modify `src/app/c/actions.ts` (return the whole `view`, not just `filled`/`total`), `src/app/c/status-state.ts`, `src/app/c/check-form.tsx`.

- [ ] **Step 1:** `checkStatusAction`: return `view: progress.view` (the union) instead of `filled`/`total`; keep `label`, `rewardReady`, `name`, `reward_text`, `qr`. Update `status-state.ts` accordingly.
- [ ] **Step 2:** In `check-form.tsx`, on found: if `view.kind === 'plant'` render `<Plant stage={view.stage} totalStages={view.totalStages} wilting={view.wilting} />` + the `label`; else render the existing dot row from `view.filled`/`view.total`. Keep the reward line, reward-ready line, and QR tile.
- [ ] **Step 3:** Update the `check-status-action` test to the `view` return shape. `pnpm check && pnpm test && pnpm build` green; commit `feat: /c renders the plant for Sprout cards`.

---

## Self-Review

**Spec coverage (§3.3):** growth-from-visits + time-decay wilt with grace + floor (never dies) ✓ (Task 1, derived-on-read via `last_visit_at` in state — no cron); bloom = reward → reset (Task 1 redeem); plant art stages seed→bloom + wilted ✓ (Task 2); vendor-friendly config (visits-to-bloom) ✓ (Task 3); dashboard water flow + bloom celebration ✓ (Task 4); customer sees the plant ✓ (Task 5). Wilt nudge is visible-in-view (no SMS — by design) ✓.

**Placeholder scan:** decay math + strategy fully coded/tested; the SVG (Task 2) and forms (Task 4) are directive but name the exact props, tokens, and the component to mirror (`lucky-form.tsx`).

**Type consistency:** `ProgressView` union consumed by narrowing on `kind` in `/c` (Task 5) and `plant-form` (Task 4); `PlantConfig`/`PlantState` used across strategy, engine resolvers, and `buildPlantConfig`; `recordVisitAction` return `{rewardUnlocked, progress, reward_text, phone}` consumed by both lucky-form and plant-form; `getProgress`/`applyVisit` `case 'plant'` mirror the lucky wiring.
