# /setup live preview auto-play animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/setup`'s live preview auto-play — every 3 seconds it simulates a real customer visit through the actual engine, celebrates with confetti on completion, pauses, then loops — for all 6 program types.

**Architecture:** `preview-state.ts` splits into two reusable pure functions (`buildPreviewProgram`, `buildInitialCard`) so the existing static preview and the new animation build their program/card identically. A new `usePreviewAnimation` hook drives the real `applyVisit()`/`getProgress()` engine functions on a `setTimeout` loop — never reimplementing per-type progress logic. `SetupForm` swaps its static call for the hook and renders the existing `ConfettiBurst` component.

**Tech Stack:** Next.js 16 App Router, React (`"use client"`, hooks), TypeScript strict, Vitest + Testing Library (`renderHook`, fake timers).

## Global Constraints

- Every task's commit must leave `pnpm check` clean, the full `pnpm test` suite passing, and `pnpm build` clean — this feature touches Client Component import graphs (`preview-animation.ts` is `"use client"`, consumed by `setup-form.tsx`), and this exact area of the codebase has broken a production build once already this week in a way `pnpm check`/`pnpm test` alone couldn't catch.
- Tick interval is exactly 3000ms; the post-completion "celebrating" pause is exactly 2000ms.
- Streak's synthetic clock jump is exactly `periodDays × 1.5` days per tick (`periodDays * 1.5 * 86_400_000` ms) — guarantees landing in `streakStrategy`'s "one period elapsed → +1" band every tick, never its "reset to 1" band.
- Any field edit (including switching card type, including editing `name`) immediately resets and restarts the loop from the (possibly head-start-seeded) initial position — no "finish the current loop with stale values" grace period.
- Under `prefers-reduced-motion: reduce`, the preview returns the static, non-ticking `buildPreviewProgress` result with no interval ever started and no confetti.
- `PreviewCard` (`src/app/setup/preview-card.tsx`) is NOT modified anywhere in this plan — it stays a pure presentational component taking `{ progress, name, rewardText }`.
- `buildPreviewProgress`'s existing public signature (`(input: PreviewInput) => Progress`) and behavior must not change — every existing test in `test/app/preview-state.test.ts` must keep passing unmodified.
- The animation must never diverge from real `applyVisit`/`getProgress` behavior — no reimplemented per-type progress/completion logic anywhere in the new code; every tick is a genuine call to the real engine functions.

---

### Task 1: Extract buildPreviewProgram and buildInitialCard from preview-state.ts

**Files:**

- Modify: `src/app/setup/preview-state.ts`
- Modify: `test/app/preview-state.test.ts`

**Interfaces:**

- Consumes: `buildChanceConfig`, `buildPlantConfig`, `buildStreakConfig`, `ProgramType` (`@/lib/program-config`); `getProgress`, `CardLike`, `ProgramLike` (`@/lib/engine`) — all already imported, unchanged.
- Produces: `buildPreviewProgram(input: Omit<PreviewInput, "headStart">): ProgramLike` and `buildInitialCard(input: Pick<PreviewInput, "type" | "stampsRequired" | "visitsToBloom" | "periodDays" | "targetStreak" | "headStart">, now: Date): CardLike` — both new exports Task 2 depends on. `buildPreviewProgress(input: PreviewInput): Progress` keeps its exact existing signature.

- [ ] **Step 1: Write the failing tests**

Append to `test/app/preview-state.test.ts` (after the existing `describe("buildPreviewProgress", ...)` block, before its closing, i.e. add these as new top-level `describe` blocks in the same file):

```ts
describe("buildPreviewProgram", () => {
  it("builds a stamp program", () => {
    const program = buildPreviewProgram({ ...base, type: "stamp" });
    expect(program).toEqual({
      type: "stamp",
      stamps_required: 10,
      reward_text: "Free kopi",
      config: { stamps_required: 10, reward_text: "Free kopi" },
    });
  });

  it("builds a lucky program, defaulting the pity ceiling to 8", () => {
    const program = buildPreviewProgram({
      ...base,
      type: "lucky",
      pityCeiling: undefined,
    });
    expect(program.stamps_required).toBe(8);
    expect(program.config).toMatchObject({
      win_probability: 0.2,
      pity_ceiling: 8,
      cooldown_visits: 0,
    });
  });

  it("builds a wheel program from the configured segments", () => {
    const program = buildPreviewProgram({
      ...base,
      type: "wheel",
      pityCeiling: undefined,
    });
    expect(program.type).toBe("wheel");
    expect(program.stamps_required).toBe(10);
  });
});

describe("buildInitialCard", () => {
  const now = new Date("2026-07-15T00:00:00Z");

  it("returns the fresh card when head start is off", () => {
    expect(
      buildInitialCard({ ...base, type: "stamp", headStart: false }, now),
    ).toEqual({ state: {}, stamp_count: 0, reward_count: 0 });
  });

  it("seeds the stamp head-start position", () => {
    const card = buildInitialCard(
      { ...base, type: "stamp", headStart: true },
      now,
    );
    expect(card.stamp_count).toBe(2);
  });

  it("seeds the plant head-start position at the Sprout floor", () => {
    const card = buildInitialCard(
      { ...base, type: "plant", headStart: true },
      now,
    );
    expect(card.state).toMatchObject({ growth: 2 });
  });

  it("seeds the streak head-start position at one banked period", () => {
    const card = buildInitialCard(
      { ...base, type: "streak", headStart: true },
      now,
    );
    expect(card.state).toMatchObject({ current_streak: 1 });
  });

  it("never seeds a head start for lucky, even when the toggle is on", () => {
    const card = buildInitialCard(
      { ...base, type: "lucky", headStart: true },
      now,
    );
    expect(card).toEqual({ state: {}, stamp_count: 0, reward_count: 0 });
  });
});
```

Add `buildPreviewProgram` and `buildInitialCard` to the existing import line at the top of the file:

```ts
import {
  buildPreviewProgress,
  buildPreviewProgram,
  buildInitialCard,
} from "@/app/setup/preview-state";
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `pnpm vitest run test/app/preview-state.test.ts`
Expected: the existing 8 `buildPreviewProgress` tests PASS (unchanged); the new tests FAIL — `Cannot find export 'buildPreviewProgram'` / `'buildInitialCard'`.

- [ ] **Step 3: Replace the full contents of preview-state.ts**

Replace the entire contents of `src/app/setup/preview-state.ts` with:

```ts
import {
  buildChanceConfig,
  buildPlantConfig,
  buildStreakConfig,
  type ProgramType,
} from "@/lib/program-config";
import { getProgress, type CardLike, type ProgramLike } from "@/lib/engine";
import type { Progress } from "@/lib/engine/types";

export type PreviewInput = {
  type: ProgramType;
  name: string;
  rewardText: string;
  stampsRequired: number;
  visitsToBloom: number;
  winPercent: number;
  pityCeiling: number | undefined;
  periodDays: number;
  targetStreak: number;
  segments: { label: string; weight: number; is_reward: boolean }[];
  headStart: boolean;
};

// Mirrors enroll_card's seed math (supabase/migrations/0014_loopkit_head_start.sql)
// exactly, so the preview never shows a head start that the real card wouldn't.
function headStartStampSeed(stampsRequired: number): number {
  const seed = Math.max(1, Math.round(stampsRequired * 0.2));
  return Math.min(seed, stampsRequired - 1);
}

function headStartPlantGrowth(visitsToBloom: number): number {
  const seed = Math.max(1, Math.round(visitsToBloom * 0.2));
  const floored = Math.max(seed, Math.round(visitsToBloom * 0.25));
  return Math.min(floored, visitsToBloom - 1);
}

const FRESH_CARD: CardLike = { state: {}, stamp_count: 0, reward_count: 0 };

// Assembles a synthetic program (config only, no card/state) from the form's
// current field values — the same type-appropriate config shape
// buildProgramFields (src/lib/program.ts) builds at save time. Shared by
// buildPreviewProgress (the static snapshot) and usePreviewAnimation (the
// ticking loop, src/app/setup/preview-animation.ts) so both build their
// program identically, with no duplicated per-type logic.
export function buildPreviewProgram(
  input: Omit<PreviewInput, "headStart">,
): ProgramLike {
  if (input.type === "stamp") {
    return {
      type: "stamp",
      stamps_required: input.stampsRequired,
      reward_text: input.rewardText,
      config: {
        stamps_required: input.stampsRequired,
        reward_text: input.rewardText,
      },
    };
  }

  if (input.type === "plant") {
    return {
      type: "plant",
      stamps_required: input.visitsToBloom,
      reward_text: input.rewardText,
      config: buildPlantConfig(input.visitsToBloom, input.rewardText),
    };
  }

  if (input.type === "streak") {
    return {
      type: "streak",
      stamps_required: input.targetStreak,
      reward_text: input.rewardText,
      config: buildStreakConfig(
        input.periodDays,
        input.targetStreak,
        input.rewardText,
      ),
    };
  }

  if (input.type === "lucky") {
    const pityCeiling = input.pityCeiling ?? 8;
    return {
      type: "lucky",
      stamps_required: pityCeiling,
      reward_text: input.rewardText,
      config: {
        win_probability: input.winPercent / 100,
        pity_ceiling: pityCeiling,
        cooldown_visits: 0,
        reward_text: input.rewardText,
      },
    };
  }

  // wheel / scratch
  return {
    type: input.type,
    stamps_required: input.pityCeiling ?? 10,
    reward_text: input.rewardText,
    config: buildChanceConfig(
      input.type,
      input.segments,
      input.pityCeiling,
      input.rewardText,
    ),
  };
}

// Assembles the head-start-aware initial CardLike for the form's current
// field values — the position a fresh preview starts at, and what an
// animation loop resets back to. `now` is threaded in explicitly (rather
// than each call site making its own `new Date()`) so a caller can share
// one instant between the seed timestamp and a subsequent getProgress()
// call — buildPreviewProgress below relies on this to match its
// pre-refactor behavior exactly. Lucky/wheel/scratch never offer head
// start, always the zero/unplayed state, matching the toggle's own
// conditional rendering in SetupForm (only shown for stamp/plant/streak).
export function buildInitialCard(
  input: Pick<
    PreviewInput,
    | "type"
    | "stampsRequired"
    | "visitsToBloom"
    | "periodDays"
    | "targetStreak"
    | "headStart"
  >,
  now: Date,
): CardLike {
  if (!input.headStart) return FRESH_CARD;

  if (input.type === "stamp") {
    return {
      state: {},
      stamp_count: headStartStampSeed(input.stampsRequired),
      reward_count: 0,
    };
  }

  if (input.type === "plant") {
    return {
      state: {
        growth: headStartPlantGrowth(input.visitsToBloom),
        last_visit_at: now.toISOString(),
        blooms: 0,
        bloomed: false,
      },
      stamp_count: 0,
      reward_count: 0,
    };
  }

  if (input.type === "streak") {
    return {
      state: {
        current_streak: 1,
        window_start: now.toISOString(),
        reward_banked: false,
      },
      stamp_count: 0,
      reward_count: 0,
    };
  }

  return FRESH_CARD;
}

// Assembles a synthetic program+card from the form's current field values and
// calls the real getProgress() — the same function src/app/c's customer page
// uses — so the preview can never drift from what a real card renders.
export function buildPreviewProgress(input: PreviewInput): Progress {
  const now = new Date();
  const program = buildPreviewProgram(input);
  const card = buildInitialCard(input, now);
  return getProgress(program, card, now);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run test/app/preview-state.test.ts`
Expected: PASS — all 13 tests (8 existing + 5 new).

- [ ] **Step 5: Run the full check, test suite, and build**

Run: `pnpm check && pnpm test && pnpm build`
Expected: all three clean/passing.

- [ ] **Step 6: Commit**

```bash
git add src/app/setup/preview-state.ts test/app/preview-state.test.ts
git commit -m "refactor: extract buildPreviewProgram and buildInitialCard from preview-state.ts"
```

---

### Task 2: usePreviewAnimation hook

**Files:**

- Create: `src/app/setup/preview-animation.ts`
- Create: `src/app/setup/preview-animation.dom.test.tsx`
- Modify: `test/setup.ts`

**Interfaces:**

- Consumes: `buildPreviewProgram`, `buildInitialCard`, `buildPreviewProgress`, `PreviewInput` (Task 1, `@/app/setup/preview-state`); `applyVisit`, `getProgress`, `CardLike` (`@/lib/engine`); `EngineEvent`, `Progress` (`@/lib/engine/types`).
- Produces: `usePreviewAnimation(input: PreviewInput): { progress: Progress; celebrating: boolean }` — Task 3 calls this directly, replacing its `buildPreviewProgress` call.

- [ ] **Step 1: Add the global matchMedia stub to test/setup.ts**

`window.matchMedia` doesn't exist in jsdom by default. This hook is the first thing in the codebase to call it, and every test that renders `SetupForm` (Task 3) will transitively call it too — add a global default stub (matching this file's existing jsdom-polyfill pattern) rather than touching every consuming test file individually.

In `test/setup.ts`, inside the existing `if (typeof Element !== "undefined") { ... }` block, add this after the `ResizeObserver` stub (before the block's closing `}`):

```ts
// jsdom doesn't implement matchMedia — usePreviewAnimation
// (src/app/setup/preview-animation.ts) calls it to detect
// prefers-reduced-motion. Default to "no preference" (matches: false) so
// existing tests exercise the animated path; a test that needs to
// simulate reduced motion overrides window.matchMedia itself.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as typeof window.matchMedia;
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/app/setup/preview-animation.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePreviewAnimation } from "@/app/setup/preview-animation";
import type { PreviewInput } from "@/app/setup/preview-state";

const base: Omit<PreviewInput, "type"> = {
  name: "Coffee card",
  rewardText: "Free kopi",
  stampsRequired: 10,
  visitsToBloom: 6,
  winPercent: 20,
  pityCeiling: 8,
  periodDays: 7,
  targetStreak: 4,
  segments: [
    { label: "Try again", weight: 5, is_reward: false },
    { label: "Free item", weight: 1, is_reward: true },
  ],
  headStart: false,
};

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

describe("usePreviewAnimation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockMatchMedia(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ticks the stamp count up every 3 seconds", () => {
    const { result } = renderHook(() =>
      usePreviewAnimation({ ...base, type: "stamp" }),
    );
    expect(result.current.progress.label).toBe("0/10 stamps");

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.progress.label).toBe("1/10 stamps");

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.progress.label).toBe("2/10 stamps");
  });

  it("celebrates on completion, then resets to zero after the pause", () => {
    const { result } = renderHook(() =>
      usePreviewAnimation({ ...base, type: "stamp", stampsRequired: 2 }),
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.progress.label).toBe("1/2 stamps");
    expect(result.current.celebrating).toBe(false);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.progress.label).toBe("2/2 stamps");
    expect(result.current.celebrating).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.progress.label).toBe("0/2 stamps");
    expect(result.current.celebrating).toBe(false);
  });

  it("resets to the head-start position, not zero, when looping", () => {
    const { result } = renderHook(() =>
      usePreviewAnimation({
        ...base,
        type: "stamp",
        stampsRequired: 2,
        headStart: true,
      }),
    );
    expect(result.current.progress.label).toBe("1/2 stamps");

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.progress.label).toBe("2/2 stamps");
    expect(result.current.celebrating).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.progress.label).toBe("1/2 stamps");
  });

  it("restarts immediately when the recipe changes", () => {
    const { result, rerender } = renderHook(
      (props: PreviewInput) => usePreviewAnimation(props),
      { initialProps: { ...base, type: "stamp" } },
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.progress.label).toBe("1/10 stamps");

    rerender({ ...base, type: "stamp", stampsRequired: 5 });
    expect(result.current.progress.label).toBe("0/5 stamps");
  });

  it("lucky can win before the pity ceiling via a real roll against the configured odds", () => {
    const rollSpy = vi.spyOn(Math, "random").mockReturnValue(0.01);
    const { result } = renderHook(() =>
      usePreviewAnimation({
        ...base,
        type: "lucky",
        winPercent: 50,
        pityCeiling: 8,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.celebrating).toBe(true);
    rollSpy.mockRestore();
  });

  it("wheel can land on a non-reward segment via a real roll against the configured weights", () => {
    // base.segments is [Try again (weight 5), Free item (weight 1)] —
    // pickSegment's cumulative buckets are [0, 0.833) = Try again,
    // [0.833, 1.0) = Free item, so 0.1 lands solidly in the non-reward
    // bucket regardless of segment order.
    const rollSpy = vi.spyOn(Math, "random").mockReturnValue(0.1);
    const { result } = renderHook(() =>
      usePreviewAnimation({ ...base, type: "wheel", pityCeiling: undefined }),
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.celebrating).toBe(false);
    rollSpy.mockRestore();
  });

  it("streak advances one period per tick via a synthetic clock jump", () => {
    const { result } = renderHook(() =>
      usePreviewAnimation({
        ...base,
        type: "streak",
        periodDays: 7,
        targetStreak: 2,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.progress.view).toMatchObject({
      kind: "streak",
      current: 1,
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.celebrating).toBe(true);
  });

  it("falls back to a static, non-ticking snapshot under prefers-reduced-motion", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() =>
      usePreviewAnimation({ ...base, type: "stamp" }),
    );
    expect(result.current.progress.label).toBe("0/10 stamps");
    expect(result.current.celebrating).toBe(false);

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.progress.label).toBe("0/10 stamps");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/app/setup/preview-animation.dom.test.tsx`
Expected: FAIL — `Cannot find module '@/app/setup/preview-animation'`.

- [ ] **Step 4: Implement preview-animation.ts**

Create `src/app/setup/preview-animation.ts`:

```ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { applyVisit, getProgress, type CardLike } from "@/lib/engine";
import type { EngineEvent, Progress } from "@/lib/engine/types";
import {
  buildInitialCard,
  buildPreviewProgram,
  buildPreviewProgress,
  type PreviewInput,
} from "@/app/setup/preview-state";

const TICK_MS = 3000;
const CELEBRATE_MS = 2000;
const MS_PER_DAY = 86_400_000;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Drives the real applyVisit()/getProgress() engine functions on a timer, so
// the /setup preview simulates a customer actually visiting every 3 seconds
// instead of showing one static snapshot. Every tick is a genuine visit
// event through the same engine src/app/c's real customer page uses — the
// animation can never show a transition a real card couldn't actually
// produce.
export function usePreviewAnimation(input: PreviewInput): {
  progress: Progress;
  celebrating: boolean;
} {
  const {
    type,
    name,
    rewardText,
    stampsRequired,
    visitsToBloom,
    winPercent,
    pityCeiling,
    periodDays,
    targetStreak,
    segments,
    headStart,
  } = input;

  // Every field is part of the "recipe" — any edit (including name, which
  // has no effect on card mechanics) resets and restarts the loop, per the
  // spec's explicit field-edit-interaction decision.
  const recipeKey = JSON.stringify([
    type,
    name,
    rewardText,
    stampsRequired,
    visitsToBloom,
    winPercent,
    pityCeiling,
    periodDays,
    targetStreak,
    segments,
    headStart,
  ]);

  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const program = useMemo(
    () => buildPreviewProgram(input),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipeKey],
  );

  const initialCard = useMemo(
    () => buildInitialCard(input, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipeKey],
  );

  const [card, setCard] = useState<CardLike>(initialCard);
  const [simulatedNow, setSimulatedNow] = useState(() => new Date());
  const [phase, setPhase] = useState<"ticking" | "celebrating">("ticking");

  // Any recipe change restarts the loop immediately from the (possibly
  // head-start-seeded) initial position.
  useEffect(() => {
    setCard(initialCard);
    setSimulatedNow(new Date());
    setPhase("ticking");
  }, [initialCard]);

  useEffect(() => {
    if (reducedMotion) return;
    const delay = phase === "celebrating" ? CELEBRATE_MS : TICK_MS;
    const timer = setTimeout(() => {
      if (phase === "celebrating") {
        setCard(initialCard);
        setSimulatedNow(new Date());
        setPhase("ticking");
        return;
      }
      const nextNow =
        type === "streak"
          ? new Date(simulatedNow.getTime() + periodDays * 1.5 * MS_PER_DAY)
          : new Date();
      const event: EngineEvent = {
        kind: "visit",
        payload: { roll: Math.random() },
      };
      const { state, rewardUnlocked } = applyVisit(
        program,
        card,
        event,
        nextNow,
      );
      setCard({ ...card, state });
      setSimulatedNow(nextNow);
      if (rewardUnlocked) setPhase("celebrating");
    }, delay);
    return () => clearTimeout(timer);
  }, [
    reducedMotion,
    phase,
    card,
    simulatedNow,
    program,
    initialCard,
    type,
    periodDays,
  ]);

  if (reducedMotion) {
    return { progress: buildPreviewProgress(input), celebrating: false };
  }

  return {
    progress: getProgress(program, card, simulatedNow),
    celebrating: phase === "celebrating",
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/app/setup/preview-animation.dom.test.tsx`
Expected: PASS — all 8 tests.

- [ ] **Step 6: Run the full check, test suite, and build**

Run: `pnpm check && pnpm test && pnpm build`
Expected: all three clean/passing.

- [ ] **Step 7: Commit**

```bash
git add src/app/setup/preview-animation.ts src/app/setup/preview-animation.dom.test.tsx test/setup.ts
git commit -m "feat: usePreviewAnimation hook driving the real engine on a 3s tick loop"
```

---

### Task 3: Wire the animation and confetti into SetupForm

**Files:**

- Modify: `src/app/setup/setup-form.tsx`

**Interfaces:**

- Consumes: `usePreviewAnimation` (Task 2, `@/app/setup/preview-animation`); `ConfettiBurst` (`@/components/confetti-burst`, pre-existing, unmodified).
- Produces: no new exports — this task only changes `SetupForm`'s internals and rendered output.

- [ ] **Step 1: Replace the preview-state import with the animation hook import**

In `src/app/setup/setup-form.tsx`, replace:

```ts
import { buildPreviewProgress } from "@/app/setup/preview-state";
import { PreviewCard } from "@/app/setup/preview-card";
```

with:

```ts
import { usePreviewAnimation } from "@/app/setup/preview-animation";
import { PreviewCard } from "@/app/setup/preview-card";
import { ConfettiBurst } from "@/components/confetti-burst";
```

- [ ] **Step 2: Replace the buildPreviewProgress call with the hook**

Replace:

```tsx
const previewProgress = buildPreviewProgress({
  type,
  name,
  rewardText,
  stampsRequired,
  visitsToBloom,
  winPercent,
  pityCeiling,
  periodDays,
  targetStreak,
  segments,
  headStart,
});
```

with:

```tsx
const { progress: previewProgress, celebrating } = usePreviewAnimation({
  type,
  name,
  rewardText,
  stampsRequired,
  visitsToBloom,
  winPercent,
  pityCeiling,
  periodDays,
  targetStreak,
  segments,
  headStart,
});
```

- [ ] **Step 3: Render ConfettiBurst alongside PreviewCard**

Replace:

```tsx
<PreviewCard progress={previewProgress} name={name} rewardText={rewardText} />
```

with:

```tsx
        <PreviewCard
          progress={previewProgress}
          name={name}
          rewardText={rewardText}
        />
        <ConfettiBurst active={celebrating} />
```

- [ ] **Step 4: Run the existing setup-form tests to confirm no regressions**

Run: `pnpm vitest run src/app/setup/setup-form.dom.test.tsx`
Expected: PASS — all 8 existing tests, unmodified. These tests only assert
on `previewProgress`/form state immediately after render or immediately
after a `user.type`/`user.click` interaction — a real 3000ms tick delay
never elapses during that fast, synchronous-per-assertion test execution,
so the animation's first tick has no opportunity to fire before any
assertion runs. No fake-timer setup is needed in this file: the hook's
`useEffect` cleanup (`clearTimeout` on unmount) already prevents any
lingering timer from firing after a test's `afterEach(cleanup)` unmounts
the component, so no stray "state update on unmounted component" warnings
either.

- [ ] **Step 5: Run the full check, test suite, and build**

Run: `pnpm check && pnpm test && pnpm build`
Expected: all three clean/passing.

- [ ] **Step 6: Commit**

```bash
git add src/app/setup/setup-form.tsx
git commit -m "feat: wire the animated preview and confetti into SetupForm"
```

## Self-Review Notes

- **Spec coverage:** Investigation's `buildPreviewProgram`/`buildInitialCard` split → Task 1. Decisions' tick/pause timing, streak clock jump, head-start-loop-position, field-edit-reset, reduced-motion fallback → Task 2 (the hook itself). Section C's `SetupForm` wiring → Task 3. Testing section's coverage list (tick advance, reward+celebrate+reset, field-edit restart, reduced-motion, per-type `rewardUnlocked` incl. deterministic `Math.random` mocking) → Task 2's test file, one test per item. All covered.
- **Placeholder scan:** none — every step shows complete code.
- **Type consistency:** `usePreviewAnimation(input: PreviewInput): { progress: Progress; celebrating: boolean }` (Task 2) is called identically in Task 3 (`const { progress: previewProgress, celebrating } = usePreviewAnimation({...})`), same field names throughout. `buildPreviewProgram`/`buildInitialCard` (Task 1) are called with matching signatures in Task 2's hook.
- **Deliberate refinement over the spec's exact text**: the spec listed `buildInitialCard(input: Pick<...>): CardLike` with no `now` parameter; this plan adds an explicit `now: Date` second parameter (Task 1) so `buildPreviewProgress` can share one instant between the head-start seed timestamp and its `getProgress` call — preserving its pre-refactor behavior exactly (the original inline code used one shared `now` variable for both) — and so `usePreviewAnimation`'s reset logic can pass its own fresh `now` at each restart. This is a strict improvement (more precise, more testable) consistent with this session's established pattern of refining implementation details during planning without re-litigating already-approved decisions.
