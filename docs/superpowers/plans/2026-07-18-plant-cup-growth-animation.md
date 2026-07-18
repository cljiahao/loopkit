# Plant/Cup Slow-Growth Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Plant` (Sprout) and `Cup` (Fill the Cup) grow smoothly and continuously between visits instead of snapping to each new stage, per `docs/superpowers/specs/2026-07-18-plant-cup-growth-animation-design.md`.

**Architecture:** Both components are self-contained SVG presentational components with no props changes and no call-site changes — `/setup`'s live preview, the vendor's serve-customer stamp screen, and the customer's `/c` card view all pick up the new animation automatically. Cup's fix is a one-line duration widen plus a fade-in wrapper on its existing latte-art group. Plant's fix is more involved: the stem moves from a resized `<line>` (whose endpoint attributes aren't CSS-animatable) to a fixed-length line animated via `transform: scaleY()` (which is), and leaf-pair positions move from a current-count-relative formula (which silently reflows existing leaves) to a fixed-slot formula. Each component is its own task with its own TDD cycle; a final manual-verification task confirms the animation actually reads as "growing" in a real browser, since dom tests can assert classes/attributes but not perceived motion.

**Tech Stack:** React 19 · TypeScript strict · Tailwind v4 (including the `starting:` variant, which compiles to `@starting-style` — used for mount-fade-in on the two conditionally-rendered treat groups) · Vitest + `@testing-library/react` · pnpm. No new dependency.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- No new animation-library dependency (no framer-motion/gsap/etc.) — pure Tailwind `motion-safe:`/`starting:` utility classes and inline `style` for values Tailwind can't express (per-leaf `transitionDelay`, dynamic `transformOrigin`), matching how this codebase already animates (see the existing wilt-rotation and Cup-fill-transition classes).
- Every new transition stays behind `motion-safe:` — `prefers-reduced-motion` users must see instant state changes, no exceptions.
- Zero changes to `src/app/setup/preview-animation.ts`, `src/app/setup/preview-card.tsx`, `src/app/dashboard/serve-customer.tsx`, or `src/features/card-check/components/program-card-status.tsx` — this is entirely contained inside `src/components/plant.tsx` and `src/components/cup.tsx`.
- Out of scope: `src/components/stamp-dots.tsx`, `src/components/flame-layers.tsx`, `src/components/points-bar.tsx`, `src/components/wheel.tsx`, `src/components/scratch-card.tsx`, and the reward-unlock celebration overlay (`src/components/card-burst.tsx`, `src/components/reward-celebration.tsx`) — none of these are touched.
- Run `pnpm check && pnpm test` after every task; commit after every task.
- Work happens in a git worktree (this repo's established convention, e.g. `.claude/worktrees/plant-cup-growth-animation`) on a feature branch — `main` hard-blocks direct commits via the lefthook + PreToolUse hooks.

---

## Task 1: Cup — widen the transition, fade in the latte-art

**Files:**

- Modify: `src/components/cup.tsx` (full file, 95 lines today)
- Modify: `src/components/cup.dom.test.tsx` (add 2 tests to the existing 5)

**Interfaces:**

- Consumes: nothing new — same `{ stage, totalStages, wilting, className }` props as today.
- Produces: nothing new consumed by other tasks — `Cup`'s exported signature is unchanged, only its internal rendering. Task 3 (manual verification) exercises this visually.

- [ ] **Step 1: Write the two failing tests, appended to the existing file**

Read `src/components/cup.dom.test.tsx` first (5 existing tests — renders svg, no-fill at stage 0, fill-rect once growth starts, latte-art only at final stage, dims fill when wilting) and add these two at the end, inside the existing `describe("Cup", ...)` block, right before the closing `});`:

```typescript
  it("uses the slow shared growth duration on the liquid fill", () => {
    const { container } = render(
      <Cup stage={2} totalStages={5} wilting={false} />,
    );
    const rect = container.querySelector("rect");
    expect(rect?.getAttribute("class")).toContain("duration-[1600ms]");
  });

  it("fades and scales the latte-art in on mount instead of popping", () => {
    const { container } = render(
      <Cup stage={4} totalStages={5} wilting={false} />,
    );
    const circle = container.querySelector("circle");
    const latteArtGroup = circle?.parentElement;
    expect(latteArtGroup?.tagName).toBe("g");
    expect(latteArtGroup?.getAttribute("class")).toContain(
      "starting:opacity-0",
    );
    expect(latteArtGroup?.getAttribute("class")).toContain(
      "starting:scale-0",
    );
  });
```

- [ ] **Step 2: Run the tests, confirm both new ones fail**

Run: `pnpm exec vitest run src/components/cup.dom.test.tsx`
Expected: 5 pass, 2 fail — `duration-[1600ms]` not found (current code has `duration-500`), and `latteArtGroup` is `null`/not a `<g>` (today's latte-art circles have no wrapping group at all).

- [ ] **Step 3: Rewrite `src/components/cup.tsx`**

```typescript
import { cn } from "@/lib/utils";

const GROWTH_TRANSITION =
  "motion-safe:transition-all motion-safe:duration-[1600ms] motion-safe:ease-out";

export function Cup({
  stage,
  totalStages,
  wilting,
  className,
}: {
  stage: number;
  totalStages: number;
  wilting: boolean;
  className?: string;
}) {
  const span = Math.max(totalStages - 1, 1);
  const frac = Math.min(Math.max(stage / span, 0), 1);
  const cupTopY = 30;
  const cupBottomY = 80;
  const liquidTopY = cupBottomY - (cupBottomY - cupTopY) * frac;
  const isFull = stage >= totalStages - 1 && totalStages > 1;

  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={cn(
        "size-32",
        wilting ? "text-muted-foreground" : "text-primary",
        className,
      )}
    >
      <ellipse
        cx="50"
        cy="90"
        rx="26"
        ry="4"
        className="fill-muted-foreground/15"
      />
      <defs>
        <clipPath id="cup-body-clip">
          <path d="M25 30 L75 30 L65 80 L35 80 Z" />
        </clipPath>
      </defs>
      {frac > 0 && (
        <rect
          x="20"
          y={liquidTopY}
          width="60"
          height={cupBottomY - liquidTopY}
          clipPath="url(#cup-body-clip)"
          className={cn(
            GROWTH_TRANSITION,
            wilting ? "fill-muted-foreground/50" : "fill-primary/60",
          )}
        />
      )}
      <path
        d="M25 30 L75 30 L65 80 L35 80 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M75 38 q14 0 14 14 q0 14 -14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {isFull && (
        <g
          style={{ transformOrigin: `50px ${liquidTopY + 2}px` }}
          className={cn(
            GROWTH_TRANSITION,
            "opacity-100 scale-100 starting:opacity-0 starting:scale-0",
          )}
        >
          <circle
            cx="43"
            cy={liquidTopY + 2}
            r="6"
            className={wilting ? "fill-muted-foreground/50" : "fill-gold"}
          />
          <circle
            cx="55"
            cy={liquidTopY + 2}
            r="6"
            className={wilting ? "fill-muted-foreground/50" : "fill-gold"}
          />
          <path
            d={`M40 ${liquidTopY + 6} L50 ${liquidTopY + 16} L60 ${liquidTopY + 6} Z`}
            className={
              wilting ? "fill-muted-foreground" : "fill-gold-foreground"
            }
          />
        </g>
      )}
    </svg>
  );
}
```

- [ ] **Step 4: Run the full Cup test file, confirm all 7 pass**

Run: `pnpm exec vitest run src/components/cup.dom.test.tsx`
Expected: 7 passed (0 failed)

- [ ] **Step 5: Full gate + commit**

Run: `pnpm check && pnpm test`
Expected: PASS

```bash
git add src/components/cup.tsx src/components/cup.dom.test.tsx
git commit -m "feat(cup): widen the fill transition and fade in the latte-art"
```

---

## Task 2: Plant — scaled-transform stem, fixed leaf slots, fading bloom

**Files:**

- Modify: `src/components/plant.tsx` (full file, 118 lines today)
- Create: `src/components/plant.dom.test.tsx`

**Interfaces:**

- Consumes: nothing new — same `{ stage, totalStages, wilting, className }` props as today.
- Produces: nothing new consumed by other tasks — `Plant`'s exported signature is unchanged, only its internal rendering. Task 3 (manual verification) exercises this visually.

- [ ] **Step 1: Write the failing test file**

```typescript
// src/components/plant.dom.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Plant } from "@/components/plant";

describe("Plant", () => {
  it("renders an svg", () => {
    const { container } = render(
      <Plant stage={0} totalStages={5} wilting={false} />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("collapses the stem to zero height and shows the seed dot at stage 0", () => {
    const { container } = render(
      <Plant stage={0} totalStages={5} wilting={false} />,
    );
    const line = container.querySelector("line");
    expect(line).toHaveStyle({ transform: "scaleY(0)" });
    const seed = Array.from(container.querySelectorAll("circle")).find((c) =>
      c.getAttribute("class")?.includes("fill-primary/60"),
    );
    expect(seed).toBeInTheDocument();
  });

  it("scales the stem toward full height as stage increases", () => {
    const { container } = render(
      <Plant stage={2} totalStages={5} wilting={false} />,
    );
    const line = container.querySelector("line");
    expect(line).toHaveStyle({ transform: "scaleY(0.5)" });
  });

  it("shows leafPairs = min(stage, 3) leaf slots as visible, the rest hidden", () => {
    const { container } = render(
      <Plant stage={1} totalStages={5} wilting={false} />,
    );
    const leafSlots = container.querySelectorAll("g > g");
    expect(leafSlots).toHaveLength(3);
    const classes = Array.from(leafSlots).map((g) => g.getAttribute("class"));
    expect(classes[0]).toContain("opacity-100");
    expect(classes[0]).toContain("scale-100");
    expect(classes[1]).toContain("opacity-0");
    expect(classes[1]).toContain("scale-0");
    expect(classes[2]).toContain("opacity-0");
  });

  it("keeps an already-placed leaf pair's position stable when a new pair appears", () => {
    const first = render(
      <Plant stage={1} totalStages={5} wilting={false} />,
    );
    const dAtStage1 = first.container
      .querySelectorAll("g > g")[0]
      .querySelector("path")
      ?.getAttribute("d");

    const second = render(
      <Plant stage={2} totalStages={5} wilting={false} />,
    );
    const dAtStage2 = second.container
      .querySelectorAll("g > g")[0]
      .querySelector("path")
      ?.getAttribute("d");

    expect(dAtStage1).toBe(dAtStage2);
  });

  it("renders the bloom only at the final stage", () => {
    const notBloom = render(
      <Plant stage={3} totalStages={5} wilting={false} />,
    );
    // Just the base shadow ellipse — no bloom petals yet.
    expect(notBloom.container.querySelectorAll("ellipse")).toHaveLength(1);

    const bloom = render(<Plant stage={4} totalStages={5} wilting={false} />);
    // Shadow ellipse + 6 petal ellipses.
    expect(bloom.container.querySelectorAll("ellipse")).toHaveLength(7);
  });

  it("dims the plant color when wilting", () => {
    const { container } = render(
      <Plant stage={2} totalStages={5} wilting={true} />,
    );
    expect(container.querySelector("svg")?.getAttribute("class")).toContain(
      "text-muted-foreground",
    );
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `pnpm exec vitest run src/components/plant.dom.test.tsx`
Expected: FAIL — today's `<line>` only exists in the DOM when `frac > 0` (so it's simply absent at stage 0 instead of present-but-`scaleY(0)`), it has no inline `transform` style at all, and there is no `g > g` leaf-slot structure (today's leaves are bare `<g key={i}>` with no wrapping classes and a count-relative, not fixed-slot, position formula).

- [ ] **Step 3: Rewrite `src/components/plant.tsx`**

```typescript
import { cn } from "@/lib/utils";

const SOIL_Y = 74;
const STEM_MAX_Y = 18;
const MAX_LEAF_PAIRS = 3;
const GROWTH_TRANSITION =
  "motion-safe:transition-all motion-safe:duration-[1600ms] motion-safe:ease-out";

export function Plant({
  stage,
  totalStages,
  wilting,
  className,
}: {
  stage: number;
  totalStages: number;
  wilting: boolean;
  className?: string;
}) {
  const span = Math.max(totalStages - 1, 1);
  const frac = Math.min(Math.max(stage / span, 0), 1);
  const isBloom = stage >= totalStages - 1 && totalStages > 1;
  const leafPairs = Math.min(stage, MAX_LEAF_PAIRS);

  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={cn(
        "size-32",
        wilting ? "text-muted-foreground" : "text-primary",
        className,
      )}
    >
      <ellipse
        cx="50"
        cy="90"
        rx="26"
        ry="4"
        className="fill-muted-foreground/15"
      />
      <path
        d="M32 74 h36 l-4 16 a2 2 0 0 1 -2 2 h-24 a2 2 0 0 1 -2 -2 z"
        className="fill-primary/25 stroke-primary/40"
        strokeWidth="1.5"
      />
      <rect
        x="30"
        y="70"
        width="40"
        height="6"
        rx="2"
        className="fill-primary/35"
      />
      <g
        style={{
          transformOrigin: "50px 74px",
          transform: wilting ? "rotate(9deg)" : "none",
        }}
        className="motion-safe:transition-transform motion-safe:duration-500"
      >
        <line
          x1="50"
          y1={SOIL_Y}
          x2="50"
          y2={STEM_MAX_Y}
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          style={{
            transformOrigin: `50px ${SOIL_Y}px`,
            transform: `scaleY(${frac})`,
          }}
          className={GROWTH_TRANSITION}
        />
        {frac === 0 && (
          <circle cx="50" cy="70" r="3.5" className="fill-primary/60" />
        )}
        {Array.from({ length: MAX_LEAF_PAIRS }, (_, i) => {
          const t = (i + 1) / (MAX_LEAF_PAIRS + 1);
          const y = SOIL_Y - (SOIL_Y - STEM_MAX_Y) * t;
          const visible = i < leafPairs;
          return (
            <g
              key={i}
              style={{
                transformOrigin: `50px ${y}px`,
                transitionDelay: `${i * 200}ms`,
              }}
              className={cn(
                GROWTH_TRANSITION,
                visible ? "opacity-100 scale-100" : "opacity-0 scale-0",
              )}
            >
              <path
                d={`M50 ${y} q -14 -6 -20 -14 q 12 0 20 8 z`}
                fill="currentColor"
              />
              <path
                d={`M50 ${y} q 14 -6 20 -14 q -12 0 -20 8 z`}
                fill="currentColor"
              />
            </g>
          );
        })}
        {isBloom && (
          <g
            style={{ transformOrigin: `50px ${STEM_MAX_Y}px` }}
            className={cn(
              GROWTH_TRANSITION,
              "opacity-100 scale-100 starting:opacity-0 starting:scale-0",
            )}
          >
            {Array.from({ length: 6 }, (_, i) => (
              <ellipse
                key={i}
                cx="50"
                cy={STEM_MAX_Y - 8}
                rx="4.5"
                ry="9"
                className={wilting ? "fill-muted-foreground/50" : "fill-gold"}
                style={{
                  transformOrigin: `50px ${STEM_MAX_Y}px`,
                  transform: `rotate(${i * 60}deg)`,
                }}
              />
            ))}
            <circle
              cx="50"
              cy={STEM_MAX_Y}
              r="5"
              className={
                wilting ? "fill-muted-foreground" : "fill-gold-foreground"
              }
            />
          </g>
        )}
      </g>
    </svg>
  );
}
```

- [ ] **Step 4: Run the test file, confirm all 7 pass**

Run: `pnpm exec vitest run src/components/plant.dom.test.tsx`
Expected: 7 passed (0 failed)

- [ ] **Step 5: Full gate + commit**

Run: `pnpm check && pnpm test`
Expected: PASS

```bash
git add src/components/plant.tsx src/components/plant.dom.test.tsx
git commit -m "feat(plant): animate stem growth via scaleY and stagger leaf/bloom fade-ins"
```

---

## Task 3: Manual verification + README fallout

**Files:**

- Modify: `src/components/README.md` (per-folder README convention — `cup.tsx`/`plant.tsx`'s one-line descriptions likely need a phrase about the new animation; verify against the CI `readme-freshness` gate, which fails if this file changed without its own README entry touched)

**Interfaces:** none — this task only verifies and documents; no code changes expected unless verification surfaces a bug.

- [ ] **Step 1: Read `src/components/README.md` and check the current `cup.tsx`/`plant.tsx` bullet wording**

Run: `git log -p -1 -- src/components/README.md` or just open the file — confirm whether the existing one-line descriptions already mention animation/transitions (Cup's likely already says something about the fill transition) or need a small update to mention the slower shared growth duration and the leaf/bloom fade-ins.

- [ ] **Step 2: Update the two bullets if needed, re-run `pnpm check` to confirm formatting**

Run: `pnpm check`
Expected: PASS

- [ ] **Step 3: Start the dev server**

Run: `pnpm dev`
Expected: server up at http://localhost:3000

- [ ] **Step 4: Manually verify Sprout (Plant) in the browser**

Navigate to `/setup`, create or edit a program with type Plant, variant Sprout (`Sprout` tile — `type: "plant"`, `variant: "plant"`). Watch the live preview for at least 3 simulated visits (~6s):

- Confirm the stem visibly rises over roughly 1.6s per visit, easing to a stop, rather than snapping.
- Confirm leaf pairs fade in one at a time (staggered), not all at once, and that a leaf already on-screen never jumps position when a new one appears.
- Let it reach the final stage — confirm the bloom fades and scales in rather than popping, and that the existing celebration burst still fires independently (unchanged).

- [ ] **Step 5: Manually verify Fill the Cup (Cup) in the browser**

Same page, switch to type Plant, variant Cup (`Fill the Cup` tile). Watch at least 3 simulated visits:

- Confirm the liquid visibly rises over ~1.6s per visit instead of snapping.
- Let it reach Full — confirm the latte-art fades and scales in rather than popping.

- [ ] **Step 6: Verify reduced motion still shows instant, static states**

In Chrome DevTools, open the Rendering tab (Cmd/Ctrl+Shift+P → "Show Rendering"), set "Emulate CSS media feature prefers-reduced-motion" to `reduce`, and reload `/setup` on both a Sprout and a Cup program.

- Confirm the preview shows one static, non-animating snapshot (the existing `usePreviewAnimation` reduced-motion branch) — no stem/liquid growth animation, no leaf stagger, no bloom/latte-art fade.

- [ ] **Step 7: Stop the dev server, run the full suite one final time**

Run: `pnpm check && pnpm test`
Expected: PASS

- [ ] **Step 8: Commit README fallout only if Step 2 changed anything**

```bash
git add src/components/README.md
git commit -m "docs(components): note the slower shared growth duration on cup/plant"
```

If Step 2 made no changes, skip this commit — there's nothing to commit.
