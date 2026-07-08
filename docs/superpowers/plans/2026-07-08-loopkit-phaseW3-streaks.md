# loopkit Phase W3 — 🔥 Streak Club — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** A fourth-and-final (for this redesign) program type: visit at least once every period (default weekly) to build a streak; miss a period and it resets. Reward at a target streak length. Reuses Sprout's proven **lazy time-derivation** pattern (progress computed from stored timestamps on read — no cron) and, learning from the v2 hardening pass, **banks the reward** so it isn't lost if the vendor doesn't redeem immediately.

**Architecture:** Pure `streakStrategy` in `src/lib/engine/streak.ts`, same `Strategy<Config,State>` shape as `plant.ts`/`chance.ts`. Window bookkeeping lives entirely in `state.window_start`; `progress()` derives whether the current window is still open, in grace, or broken — purely from `now` vs stored timestamps, mutating nothing. `apply()` is the only place state changes. Reuses `record_visit`.

**Tech Stack:** Next 16, TS strict, Supabase (schema `loopkit`), Vitest, pnpm 11. Builds on the full engine + Phase W2's `ProgressView` union.

## Global Constraints

- TS strict; no inline comments; match existing style.
- `progress()` MUST be a pure function of `(state, config, now)` — never mutate, never call `Date.now()` internally (only via the passed `now`).
- **Bank the reward**: when a visit crosses the target streak, persist `reward_banked: true` in state; `rewardReady` reads that flag, not a live recompute — so a reward earned today is still redeemable next week even if the streak later resets. `redeem` clears the flag and resets the streak counter.
- Schema change → migration `0011_*` (widen `programs.type`) + `src/lib/types.ts` + drift test.
- Every task ends green: `pnpm check && pnpm test && pnpm build`.
- Spec: `docs/superpowers/specs/2026-07-08-loopkit-counter-first-design.md` Part 3 (Wave 1).

---

### Task 1: Migration 0011 — widen `programs.type` for `streak`

**Files:** Create `supabase/migrations/0011_loopkit_streak_type.sql`; Modify `src/lib/types.ts`, `docs/DEPLOY.md`; Test `test/db/streak-type-schema.test.ts`.

- [ ] Drift test asserting the check constraint now includes `streak` alongside `stamp,lucky,plant,wheel,scratch`.
- [ ] Migration:
```sql
-- supabase/migrations/0011_loopkit_streak_type.sql
-- Widen programs.type to admit the streak template. No new tables/RPCs —
-- record_visit (0005) already persists arbitrary per-type state.
alter table loopkit.programs drop constraint if exists programs_type_check;
alter table loopkit.programs
  add constraint programs_type_check
  check (type in ('stamp','lucky','plant','wheel','scratch','streak'));
```
- [ ] `src/lib/types.ts` comment update if any; `docs/DEPLOY.md` apply-0011 step. PASS; green; commit `feat: 0011 widen programs.type for streak`.

### Task 2: `streakStrategy` — window derivation + banked reward

**Files:** Create `src/lib/engine/streak.ts`; Modify `src/lib/engine/types.ts` (new `ProgressView` variant); Test `test/lib/engine/streak.test.ts`.

**Interfaces:**
- `ProgressView` gains: `{ kind: "streak"; current: number; target: number; status: "active" | "grace" | "broken" | "none" }`.
- `type StreakConfig = { period_days: number; target_streak: number; reward_text: string }`.
- `type StreakState = { current_streak: number; window_start: string | null; reward_banked: boolean }`.
- `streakStrategy: Strategy<StreakConfig, StreakState>`.

- [ ] **Failing tests** (`test/lib/engine/streak.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { streakStrategy, type StreakConfig } from "@/lib/engine/streak";

const cfg: StreakConfig = { period_days: 7, target_streak: 3, reward_text: "free item" };
const day0 = new Date("2026-07-01T00:00:00Z");

describe("streakStrategy", () => {
  it("first visit opens a window at streak 1", () => {
    const r = streakStrategy.apply({ kind: "visit" },
      { current_streak: 0, window_start: null, reward_banked: false }, cfg, day0);
    expect(r.state).toEqual({ current_streak: 1, window_start: day0.toISOString(), reward_banked: false });
    expect(r.rewardUnlocked).toBe(false);
  });

  it("a second visit within the same window does not increment", () => {
    const midWindow = new Date("2026-07-04T00:00:00Z");
    const r = streakStrategy.apply({ kind: "visit" },
      { current_streak: 1, window_start: day0.toISOString(), reward_banked: false }, cfg, midWindow);
    expect(r.state.current_streak).toBe(1);
  });

  it("a visit in the next window increments the streak", () => {
    const nextWindow = new Date("2026-07-08T00:00:00Z"); // day0 + 7d
    const r = streakStrategy.apply({ kind: "visit" },
      { current_streak: 1, window_start: day0.toISOString(), reward_banked: false }, cfg, nextWindow);
    expect(r.state.current_streak).toBe(2);
    expect(r.state.window_start).toBe(nextWindow.toISOString());
  });

  it("banks the reward on crossing the target and keeps it banked", () => {
    const nextWindow = new Date("2026-07-08T00:00:00Z");
    const r = streakStrategy.apply({ kind: "visit" },
      { current_streak: 2, window_start: day0.toISOString(), reward_banked: false }, cfg, nextWindow);
    expect(r.state.current_streak).toBe(3);
    expect(r.rewardUnlocked).toBe(true);
    expect(r.state.reward_banked).toBe(true);
    const p = streakStrategy.progress(r.state, cfg, nextWindow);
    expect(p.rewardReady).toBe(true);
  });

  it("skipping more than one full window resets the streak to 1", () => {
    const farFuture = new Date("2026-07-20T00:00:00Z"); // day0 + 19d, > 2 periods
    const r = streakStrategy.apply({ kind: "visit" },
      { current_streak: 2, window_start: day0.toISOString(), reward_banked: false }, cfg, farFuture);
    expect(r.state.current_streak).toBe(1);
    expect(r.state.window_start).toBe(farFuture.toISOString());
  });

  it("progress reports 'active' inside the window, 'grace' one window late, 'broken' beyond that", () => {
    const state = { current_streak: 2, window_start: day0.toISOString(), reward_banked: false };
    expect(streakStrategy.progress(state, cfg, new Date("2026-07-04T00:00:00Z")).view.status).toBe("active");
    expect(streakStrategy.progress(state, cfg, new Date("2026-07-10T00:00:00Z")).view.status).toBe("grace");
    expect(streakStrategy.progress(state, cfg, new Date("2026-07-20T00:00:00Z")).view.status).toBe("broken");
  });

  it("redeem clears the banked reward and resets the streak", () => {
    const s = streakStrategy.redeem({ current_streak: 3, window_start: day0.toISOString(), reward_banked: true }, cfg);
    expect(s.current_streak).toBe(0);
    expect(s.reward_banked).toBe(false);
  });
});
```

- [ ] Extend `ProgressView` in `types.ts` with the `streak` variant.
- [ ] Implement `src/lib/engine/streak.ts`:
  - `defaults`: `{ current_streak: 0, window_start: null, reward_banked: false }`.
  - `apply(event, state, config, now)`: if `event.kind !== "visit"` passthrough. Let `periodMs = config.period_days * 86_400_000`. If `state.window_start === null`: new state `{current_streak:1, window_start: now.toISOString(), reward_banked: state.reward_banked}`. Else `elapsed = now.getTime() - new Date(state.window_start).getTime()`; if `elapsed < periodMs` (same window): state unchanged (still return the object, don't mutate the window). Else if `elapsed < 2*periodMs` (exactly the next window — the grace-turned-continue case): `nextStreak = state.current_streak + 1`; new `window_start = now.toISOString()`. Else (missed ≥1 full window): `nextStreak = 1`; new `window_start = now.toISOString()`. Compute `crossed = nextStreak >= config.target_streak && state.current_streak < config.target_streak`; `reward_banked = state.reward_banked || crossed`; return `{state: {current_streak: nextStreak, window_start, reward_banked}, rewardUnlocked: crossed}`.
  - `progress(state, config, now)`: if `window_start === null` → `status:"none"`, `current:0`. Else `elapsed = now - window_start`; `status = elapsed < periodMs ? "active" : elapsed < 2*periodMs ? "grace" : "broken"`; `current = status === "broken" ? 0 : state.current_streak`. `label` per status (e.g. "3-week streak — visit again to keep it" / "Streak at risk — visit before the window closes" / "Streak reset — start again"). `rewardReady: state.reward_banked === true`.
  - `redeem(state)`: `{ current_streak: 0, window_start: state.window_start, reward_banked: false }`.
- [ ] Register in `src/lib/engine/index.ts`: `resolveStreakConfig`/`resolveStreakState` (defaults fallback), `case "streak"` in `applyVisit` + `getProgress`.
- [ ] Tests PASS; `pnpm check && pnpm test && pnpm build` green; commit `feat: streak strategy (lazy window derivation + banked reward)`.

### Task 3: `/setup` — Streak option

**Files:** Modify `src/app/setup/setup-form.tsx`, `src/lib/program.ts` (schema), `src/app/setup/actions.ts`.

- [ ] Extend `saveProgramSchema` with `{type:'streak', name, reward_text, period_days: 1..30 default 7, target_streak: 2..20 default 4}`. Add the Streak option to the type picker; a config sub-form (period in days, target streak count) mirroring the existing per-type conditional pattern.
- [ ] `saveProgramAction`: build `config: {period_days, target_streak, reward_text}`, `stamps_required = target_streak` (placeholder for the NOT NULL 2..20 column, same convention as lucky/plant/wheel/scratch).
- [ ] Green; commit `feat: /setup Streak Club program type`.

### Task 4: Counter + `/c` streak UI

**Files:** Create `src/components/streak-flame.tsx`; Modify `src/app/dashboard/serve-customer.tsx`, `src/app/c/check-form.tsx`.

- [ ] `<StreakFlame current target status className>`: a simple flame/count badge (lucide `Flame` icon + "N-week streak", color/opacity by `status` — full color "active", amber "grace", muted "broken"). Self-contained, no dependency.
- [ ] `serve-customer.tsx`: add a `"streak"` `ServeResult` mode (mirror `plant`'s shape — reads `res.progress.view` for `current`/`target`/`status`, `res.progress.rewardReady` for the Redeem gate — **use `rewardReady`, not `rewardUnlocked`, for the Redeem gate**, per the Phase-4 lesson); render `<StreakFlame>` + the label; primary button copy "Check in". Redeem via the existing plant-style `AlertDialog` pattern, calling a new thin `redeemStreakAction` (mirror `redeemPlantAction` exactly: load card by phone, `streakStrategy.redeem`, persist via `record_visit` kind `redeem`).
- [ ] `c/check-form.tsx`: render `<StreakFlame>` when `view.kind === "streak"`.
- [ ] Green; commit `feat: streak counter and customer UI`.

---

## Self-Review

**Spec coverage (Part 3, Wave 1):** lazy time-derivation (Task 2, mirrors Sprout, no cron); reward at target streak, loss-averse "resets if you skip a period" framing (progress `status`); banked reward fixing the exact bug class found in the hardening pass (Task 2 constraint + tests). No new RPC.

**Placeholder scan:** `streakStrategy` fully specified with exact window-boundary arithmetic and test cases covering same-window/next-window/skipped-window/banking/redeem; UI tasks mirror named existing patterns (`plant-form`'s AlertDialog, `redeemPlantAction`).

**Type consistency:** `StreakConfig`/`StreakState`/`ProgressView` "streak" variant consistent across strategy, engine resolvers, and UI; `rewardReady` (not `rewardUnlocked`) drives the Redeem gate, matching the Phase-4/hardening fix.
