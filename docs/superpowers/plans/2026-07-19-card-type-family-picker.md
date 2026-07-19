# Card Type Family Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regroup `/setup`'s flat 8-tile card-type picker into 4 families (Stamp Card, Sprout, Chance Card, Lucky Tap) with a style sub-step, per `docs/superpowers/specs/2026-07-19-card-type-family-picker-design.md` — no DB/schema/engine changes, every family+style combination maps to an existing `type`/`variant` pair.

**Architecture:** Extract the family/style data and the two mapping functions (`resolveFamilyAndStyle` for display, `styleToTypeAndVariant` for the inverse) into a new pure module (`src/app/setup/card-type-picker.ts`), mirroring this codebase's `setup-view.ts`/`dashboard-view.ts` precedent, so the mapping logic gets fast unit coverage independent of the form's React state. `setup-form.tsx` then uses that module to render a two-step picker (family grid → style grid) and replaces its inline `pickType()` with `pickFamily()`/`pickStyle()`, which call the module's mapping function instead of duplicating it.

**Tech Stack:** React 19 client component · TypeScript strict · Tailwind v4 · Vitest + Testing Library · pnpm.

## Global Constraints

- No DB/schema/migration/engine changes — every `type`/`variant` value written to the database stays byte-identical to today (verified by the round-trip test in Task 1).
- `pickType()`'s existing side effects (reset name/reward to blank, set type-specific numeric defaults) are preserved exactly — just reachable via family-click-then-style-click instead of one click.
- Edit flow (`isEdit === true`) is unchanged: still shows the locked type label, never the picker grid.
- Lucky Tap has no second step — clicking it in the family grid completes selection immediately, same as clicking any leaf tile today.
- Run `pnpm check && pnpm test` after every task; commit after every task.
- Work happens in the existing worktree/branch `worktree-setup-create-manage-split` (`.claude/worktrees/setup-create-manage-split`) — this folds into PR #13, no new worktree.

---

## Task 1: `card-type-picker.ts` — family/style data and pure mapping functions

**Files:**

- Create: `src/app/setup/card-type-picker.ts`
- Create: `src/app/setup/card-type-picker.test.ts`

**Interfaces:**

- Produces: `type FamilyKey = "stamp" | "plant" | "chance" | "lucky"`, `type StyleKey = "dots" | "flame" | "points" | "plant" | "cup" | "wheel" | "scratch" | "lucky"`, `type StyleOption = { key: StyleKey; label: string; description: string }`, `type Family = { key: FamilyKey; label: string; description: string; styles: StyleOption[] }`, `const FAMILIES: Family[]`, `function familyOf(key: FamilyKey): Family`, `function isSingleStyleFamily(key: FamilyKey): boolean`, `function resolveFamilyAndStyle(type: string, variant: string | undefined): { family: FamilyKey; style: StyleKey }`, `function styleToTypeAndVariant(style: StyleKey): { type: "stamp" | "plant" | "wheel" | "scratch" | "lucky"; variant?: "dots" | "flame" | "points" | "plant" | "cup" }` — all consumed by Task 2 (`setup-form.tsx`).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/setup/card-type-picker.test.ts
import { describe, it, expect } from "vitest";
import {
  FAMILIES,
  familyOf,
  isSingleStyleFamily,
  resolveFamilyAndStyle,
  styleToTypeAndVariant,
} from "./card-type-picker";

describe("FAMILIES", () => {
  it("has exactly 4 families in order: stamp, plant, chance, lucky", () => {
    expect(FAMILIES.map((f) => f.key)).toEqual([
      "stamp",
      "plant",
      "chance",
      "lucky",
    ]);
  });

  it("stamp has 3 styles, plant has 2, chance has 2, lucky has 1", () => {
    expect(familyOf("stamp").styles).toHaveLength(3);
    expect(familyOf("plant").styles).toHaveLength(2);
    expect(familyOf("chance").styles).toHaveLength(2);
    expect(familyOf("lucky").styles).toHaveLength(1);
  });
});

describe("isSingleStyleFamily", () => {
  it("is true only for lucky", () => {
    expect(isSingleStyleFamily("lucky")).toBe(true);
    expect(isSingleStyleFamily("stamp")).toBe(false);
    expect(isSingleStyleFamily("plant")).toBe(false);
    expect(isSingleStyleFamily("chance")).toBe(false);
  });
});

describe("resolveFamilyAndStyle", () => {
  it("maps stamp with no/'dots' variant to the stamp family's dots style", () => {
    expect(resolveFamilyAndStyle("stamp", undefined)).toEqual({
      family: "stamp",
      style: "dots",
    });
    expect(resolveFamilyAndStyle("stamp", "dots")).toEqual({
      family: "stamp",
      style: "dots",
    });
  });

  it("maps stamp/flame and stamp/points to the stamp family", () => {
    expect(resolveFamilyAndStyle("stamp", "flame")).toEqual({
      family: "stamp",
      style: "flame",
    });
    expect(resolveFamilyAndStyle("stamp", "points")).toEqual({
      family: "stamp",
      style: "points",
    });
  });

  it("maps plant with no/'plant' variant and 'cup' variant to the plant family", () => {
    expect(resolveFamilyAndStyle("plant", undefined)).toEqual({
      family: "plant",
      style: "plant",
    });
    expect(resolveFamilyAndStyle("plant", "plant")).toEqual({
      family: "plant",
      style: "plant",
    });
    expect(resolveFamilyAndStyle("plant", "cup")).toEqual({
      family: "plant",
      style: "cup",
    });
  });

  it("maps wheel and scratch to the chance family", () => {
    expect(resolveFamilyAndStyle("wheel", undefined)).toEqual({
      family: "chance",
      style: "wheel",
    });
    expect(resolveFamilyAndStyle("scratch", undefined)).toEqual({
      family: "chance",
      style: "scratch",
    });
  });

  it("maps lucky to the lucky family", () => {
    expect(resolveFamilyAndStyle("lucky", undefined)).toEqual({
      family: "lucky",
      style: "lucky",
    });
  });
});

describe("styleToTypeAndVariant", () => {
  it("round-trips every style through resolveFamilyAndStyle back to itself", () => {
    for (const family of FAMILIES) {
      for (const style of family.styles) {
        const { type, variant } = styleToTypeAndVariant(style.key);
        expect(resolveFamilyAndStyle(type, variant)).toEqual({
          family: family.key,
          style: style.key,
        });
      }
    }
  });

  it("wheel, scratch, and lucky styles carry no variant", () => {
    expect(styleToTypeAndVariant("wheel").variant).toBeUndefined();
    expect(styleToTypeAndVariant("scratch").variant).toBeUndefined();
    expect(styleToTypeAndVariant("lucky").variant).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `pnpm exec vitest run src/app/setup/card-type-picker.test.ts`
Expected: FAIL — `Cannot find module './card-type-picker'` (the file doesn't exist yet).

- [ ] **Step 3: Write `src/app/setup/card-type-picker.ts`**

```typescript
// src/app/setup/card-type-picker.ts
// Pure family/style data and mapping for /setup's type picker. Groups the
// backend's existing 5 program types (2 of which already fan out into
// variants) into 4 vendor-facing families with a style sub-step, so the
// picker stops reading as "8 unrelated card types." No new type/variant
// value is introduced — "chance" is a UI-only grouping label over the
// existing wheel/scratch DB type values. Extracted from setup-form.tsx so
// this mapping gets fast, unmocked test coverage, same pattern as
// setup-view.ts / dashboard-view.ts.

export type FamilyKey = "stamp" | "plant" | "chance" | "lucky";

export type StyleKey =
  | "dots"
  | "flame"
  | "points"
  | "plant"
  | "cup"
  | "wheel"
  | "scratch"
  | "lucky";

export type StyleOption = {
  key: StyleKey;
  label: string;
  description: string;
};

export type Family = {
  key: FamilyKey;
  label: string;
  description: string;
  styles: StyleOption[];
};

export const FAMILIES: Family[] = [
  {
    key: "stamp",
    label: "Stamp Card",
    description: "Collect stamps toward a reward",
    styles: [
      {
        key: "dots",
        label: "Classic",
        description: "Collect stamps toward a reward",
      },
      {
        key: "flame",
        label: "Flame Club",
        description: "Build a flame with every visit",
      },
      {
        key: "points",
        label: "Points Club",
        description: "Earn a set number of points every visit",
      },
    ],
  },
  {
    key: "plant",
    label: "Sprout",
    description: "Grow a plant with every visit",
    styles: [
      {
        key: "plant",
        label: "Classic",
        description: "Grow a plant with every visit",
      },
      {
        key: "cup",
        label: "Fill the Cup",
        description: "Fill a cup with every visit",
      },
    ],
  },
  {
    key: "chance",
    label: "Chance Card",
    description: "A random prize on every visit",
    styles: [
      {
        key: "wheel",
        label: "Spin the Wheel",
        description: "Spin for a prize on every visit",
      },
      {
        key: "scratch",
        label: "Scratch Card",
        description: "Scratch for a prize on every visit",
      },
    ],
  },
  {
    key: "lucky",
    label: "Lucky Tap",
    description: "A chance to win on every visit",
    styles: [
      {
        key: "lucky",
        label: "Lucky Tap",
        description: "A chance to win on every visit",
      },
    ],
  },
];

export function familyOf(key: FamilyKey): Family {
  const family = FAMILIES.find((f) => f.key === key);
  if (!family) throw new Error(`Unknown family: ${key}`);
  return family;
}

export function isSingleStyleFamily(key: FamilyKey): boolean {
  return familyOf(key).styles.length === 1;
}

// Which family + style a saved type/variant pair belongs to — drives the
// picker's active-tile highlight in both steps.
export function resolveFamilyAndStyle(
  type: string,
  variant: string | undefined,
): { family: FamilyKey; style: StyleKey } {
  if (type === "stamp") {
    if (variant === "flame") return { family: "stamp", style: "flame" };
    if (variant === "points") return { family: "stamp", style: "points" };
    return { family: "stamp", style: "dots" };
  }
  if (type === "plant") {
    if (variant === "cup") return { family: "plant", style: "cup" };
    return { family: "plant", style: "plant" };
  }
  if (type === "wheel") return { family: "chance", style: "wheel" };
  if (type === "scratch") return { family: "chance", style: "scratch" };
  return { family: "lucky", style: "lucky" };
}

const STYLE_TO_TYPE_VARIANT: Record<
  StyleKey,
  {
    type: "stamp" | "plant" | "wheel" | "scratch" | "lucky";
    variant?: "dots" | "flame" | "points" | "plant" | "cup";
  }
> = {
  dots: { type: "stamp", variant: "dots" },
  flame: { type: "stamp", variant: "flame" },
  points: { type: "stamp", variant: "points" },
  plant: { type: "plant", variant: "plant" },
  cup: { type: "plant", variant: "cup" },
  wheel: { type: "wheel" },
  scratch: { type: "scratch" },
  lucky: { type: "lucky" },
};

// The inverse of resolveFamilyAndStyle — picking a style resolves to the
// type/variant pair saved to the database. wheel/scratch/lucky never had a
// variant column value, so their entries omit it.
export function styleToTypeAndVariant(style: StyleKey): {
  type: "stamp" | "plant" | "wheel" | "scratch" | "lucky";
  variant?: "dots" | "flame" | "points" | "plant" | "cup";
} {
  return STYLE_TO_TYPE_VARIANT[style];
}
```

- [ ] **Step 4: Run the tests, confirm all 9 pass**

Run: `pnpm exec vitest run src/app/setup/card-type-picker.test.ts`
Expected: 9 passed (0 failed)

- [ ] **Step 5: Full gate + commit**

Run: `pnpm check && pnpm test`
Expected: PASS

```bash
git add src/app/setup/card-type-picker.ts src/app/setup/card-type-picker.test.ts
git commit -m "feat(setup): add card-type-picker family/style mapping module"
```

---

## Task 2: `setup-form.tsx` — two-step family/style picker

**Files:**

- Modify: `src/app/setup/setup-form.tsx`

**Interfaces:**

- Consumes: `FAMILIES`, `familyOf`, `isSingleStyleFamily`, `resolveFamilyAndStyle`, `styleToTypeAndVariant`, `type FamilyKey`, `type StyleKey` from `./card-type-picker` (Task 1).
- Produces: no change to `SetupForm`'s exported props shape — still `{ program, isEdit, replacingId, replacingType, prepping? }`. `typeLabels` and `TypeOptionValue` (used only by the existing `isEdit` locked-label path) are untouched.

This task makes three targeted edits to the existing 807-line file. Nothing outside these three regions changes — the Basics/Rules cards, segment editor, preview wiring, and form submission further down the file (lines 305+ in the pre-edit file) are untouched.

- [ ] **Step 1: Add the import and delete the now-unused `TYPE_OPTIONS` array**

Find this block near the top of the file (after the existing imports):

```typescript
import { Tag, SlidersHorizontal } from "lucide-react";

type SegmentInput = { label: string; weight: number; is_reward: boolean };
```

Replace it with:

```typescript
import { Tag, SlidersHorizontal } from "lucide-react";
import {
  FAMILIES,
  familyOf,
  isSingleStyleFamily,
  resolveFamilyAndStyle,
  styleToTypeAndVariant,
  type FamilyKey,
} from "@/app/setup/card-type-picker";

type SegmentInput = { label: string; weight: number; is_reward: boolean };
```

Then find and delete the entire `TYPE_OPTIONS` array (it is no longer read anywhere — the picker now renders from `FAMILIES`):

```typescript
const TYPE_OPTIONS = [
  {
    value: "stamp",
    label: "Stamp card",
    description: "Collect stamps toward a reward",
  },
  {
    value: "flame",
    label: "Flame Club",
    description: "Build a flame with every visit",
  },
  {
    value: "points",
    label: "Points Club",
    description: "Earn a set number of points every visit",
  },
  {
    value: "lucky",
    label: "Lucky Tap",
    description: "A chance to win on every visit",
  },
  {
    value: "plant",
    label: "Sprout",
    description: "Grow a plant with every visit",
  },
  {
    value: "cup",
    label: "Fill the Cup",
    description: "Fill a cup with every visit",
  },
  {
    value: "wheel",
    label: "Spin the Wheel",
    description: "Spin for a prize on every visit",
  },
  {
    value: "scratch",
    label: "Scratch Card",
    description: "Scratch for a prize on every visit",
  },
] as const;
```

Leave `typeLabels` and `type TypeOptionValue` (just above `TYPE_OPTIONS`) exactly as they are — both are still used by the `isEdit` locked-label path later in the file.

- [ ] **Step 2: Replace `pickType()` with `pickFamily()`/`pickStyle()`, and add `familyStep` state**

Find this block (the `variant` state declaration through `selectedOptionKey`):

```typescript
  const [variant, setVariant] = useState<
    "dots" | "flame" | "points" | "plant" | "cup"
  >(() => {
    if (config.variant === "flame") return "flame";
    if (config.variant === "points") return "points";
    if (config.variant === "cup") return "cup";
    return initialType === "plant" ? "plant" : "dots";
  });
  const selectedOptionKey: TypeOptionValue =
    type === "stamp" && variant === "flame"
      ? "flame"
      : type === "stamp" && variant === "points"
        ? "points"
        : type === "plant" && variant === "cup"
          ? "cup"
          : (type as TypeOptionValue);
```

Replace it with (same two declarations, plus the new picker-step state and a derived family/style pair):

```typescript
  const [variant, setVariant] = useState<
    "dots" | "flame" | "points" | "plant" | "cup"
  >(() => {
    if (config.variant === "flame") return "flame";
    if (config.variant === "points") return "points";
    if (config.variant === "cup") return "cup";
    return initialType === "plant" ? "plant" : "dots";
  });
  const selectedOptionKey: TypeOptionValue =
    type === "stamp" && variant === "flame"
      ? "flame"
      : type === "stamp" && variant === "points"
        ? "points"
        : type === "plant" && variant === "cup"
          ? "cup"
          : (type as TypeOptionValue);

  // Step 1 shows the 4 family tiles; picking a multi-style family switches
  // to that family's style tiles (Step 2). "family" means Step 1 is showing.
  const [familyStep, setFamilyStep] = useState<"family" | FamilyKey>(
    "family",
  );
  const currentFamilyAndStyle = resolveFamilyAndStyle(type, variant);
```

Now find the `pickType()` function and its preceding comment:

```typescript
  // Sets the type plus its sensible numeric defaults, and always resets
  // name/rewardText to blank — the vendor types both themselves, no
  // suggested copy is ever prefilled on the create flow. The Flame Club
  // tile maps to type "stamp" + variant "flame" — it is never a distinct
  // ProgramType (see program-config.ts).
  function pickType(value: TypeOptionValue) {
    setType(
      value === "flame" || value === "points"
        ? "stamp"
        : value === "cup"
          ? "plant"
          : value,
    );
    setVariant(
      value === "flame"
        ? "flame"
        : value === "points"
          ? "points"
          : value === "cup"
            ? "cup"
            : value === "stamp"
              ? "dots"
              : value === "plant"
                ? "plant"
                : "dots",
    );
    setName("");
    setRewardText("");
    setStampsRequired(value === "points" ? 500 : 10);
    setVisitsToBloom(6);
    setWinPercent(20);
    setPityCeiling(value === "lucky" ? 8 : undefined);
    setHeadStartPercent(20);
    setPointsPerVisit(10);
  }
```

Replace it with:

```typescript
  // Sets the type plus its sensible numeric defaults, and always resets
  // name/rewardText to blank — the vendor types both themselves, no
  // suggested copy is ever prefilled on the create flow. Delegates the
  // style -> type/variant mapping to card-type-picker.ts so this file
  // doesn't duplicate it.
  function pickStyle(style: StyleKey) {
    const { type: nextType, variant: nextVariant } =
      styleToTypeAndVariant(style);
    setType(nextType);
    setVariant(nextVariant ?? "dots");
    setName("");
    setRewardText("");
    setStampsRequired(style === "points" ? 500 : 10);
    setVisitsToBloom(6);
    setWinPercent(20);
    setPityCeiling(style === "lucky" ? 8 : undefined);
    setHeadStartPercent(20);
    setPointsPerVisit(10);
  }

  // Clicking a family either completes the pick immediately (Lucky Tap has
  // exactly one style, so there's nothing to choose) or opens that
  // family's style tiles (Step 2).
  function pickFamily(family: FamilyKey) {
    if (isSingleStyleFamily(family)) {
      pickStyle(familyOf(family).styles[0].key);
      return;
    }
    setFamilyStep(family);
  }
```

You'll need `type StyleKey` imported (already added in Step 1 of this task) — add it to that import's destructured list alongside `type FamilyKey`:

```typescript
import {
  FAMILIES,
  familyOf,
  isSingleStyleFamily,
  resolveFamilyAndStyle,
  styleToTypeAndVariant,
  type FamilyKey,
  type StyleKey,
} from "@/app/setup/card-type-picker";
```

- [ ] **Step 3: Replace the picker grid JSX**

Find this block:

```tsx
        {isEdit ? (
          <p className="flex h-11 items-center rounded-xl border bg-muted/40 px-3 text-sm font-semibold text-muted-foreground">
            {typeLabels[selectedOptionKey]}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-label={option.label}
                onClick={() => pickType(option.value)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors",
                  selectedOptionKey === option.value
                    ? "border-primary bg-primary/10"
                    : "bg-card hover:bg-muted/50",
                )}
              >
                <span className="text-sm font-semibold">{option.label}</span>
                <span className="text-xs text-muted-foreground">
                  {option.description}
                </span>
              </button>
            ))}
          </div>
        )}
```

Replace it with:

```tsx
        {isEdit ? (
          <p className="flex h-11 items-center rounded-xl border bg-muted/40 px-3 text-sm font-semibold text-muted-foreground">
            {typeLabels[selectedOptionKey]}
          </p>
        ) : familyStep === "family" ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {FAMILIES.map((family) => (
              <button
                key={family.key}
                type="button"
                aria-label={family.label}
                onClick={() => pickFamily(family.key)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors",
                  currentFamilyAndStyle.family === family.key
                    ? "border-primary bg-primary/10"
                    : "bg-card hover:bg-muted/50",
                )}
              >
                <span className="text-sm font-semibold">{family.label}</span>
                <span className="text-xs text-muted-foreground">
                  {family.description}
                </span>
                {family.styles.length > 1 ? (
                  <span className="mt-1 text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground/70">
                    {family.styles.length} styles
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setFamilyStep("family")}
              className="text-xs font-medium text-primary hover:underline"
            >
              ← Back
            </button>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {familyOf(familyStep).styles.map((style) => (
                <button
                  key={style.key}
                  type="button"
                  aria-label={style.label}
                  onClick={() => pickStyle(style.key)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors",
                    currentFamilyAndStyle.style === style.key
                      ? "border-primary bg-primary/10"
                      : "bg-card hover:bg-muted/50",
                  )}
                >
                  <span className="text-sm font-semibold">{style.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {style.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
```

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint src/app/setup/setup-form.tsx`
Expected: PASS, no errors (in particular, no "unused variable" errors for the old `pickType`/`TYPE_OPTIONS` — both must be fully removed, not just unreferenced)

- [ ] **Step 5: Full gate + commit**

Run: `pnpm check && pnpm test`
Expected: FAIL at this point — Task 3 hasn't updated the test file yet, so the old flat-grid tests will fail against the new two-step UI. That's expected; commit anyway, Task 3 fixes the tests next.

```bash
git add src/app/setup/setup-form.tsx
git commit -m "feat(setup): regroup the type picker into 4 families with a style sub-step"
```

---

## Task 3: `setup-form.dom.test.tsx` — migrate tests to the two-step picker

**Files:**

- Modify: `src/app/setup/setup-form.dom.test.tsx`

**Interfaces:** none new — this task only updates test interactions to match Task 2's UI; it consumes the same `SetupForm` export as before.

The existing `describe("SetupForm type picker", ...)` block (currently 10 tests) assumes a flat grid where every leaf is one click away. Each of those tests needs a family click inserted before its style click, except the two Lucky Tap tests (Lucky Tap has no Step 2) and the two tests that don't touch the picker's type at all (`"shows the type-picker heading..."`, `"shows the head-start percent input..."` — these use the default stamp/dots type and never click a tile).

- [ ] **Step 1: Replace the `"SetupForm type picker"` describe block**

Find the entire block (from `describe("SetupForm type picker", ...)` through its closing `});`, i.e. lines 75–316 of the current file) and replace it with:

```typescript
describe("SetupForm type picker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the 4 family tiles on Step 1, no flat 8-tile grid", () => {
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Stamp Card" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sprout" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Chance Card" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Lucky Tap" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Flame Club" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Spin the Wheel" }),
    ).not.toBeInTheDocument();
  });

  it("clicking a multi-style family shows its styles and a Back link", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Stamp Card" }));

    expect(
      screen.getByRole("button", { name: "Flame Club" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Points Club" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Classic" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "← Back" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Stamp Card" }),
    ).not.toBeInTheDocument();
  });

  it("clicking Back returns to the 4 family tiles", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Stamp Card" }));
    await user.click(screen.getByRole("button", { name: "← Back" }));

    expect(
      screen.getByRole("button", { name: "Stamp Card" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sprout" })).toBeInTheDocument();
  });

  it("clicking Lucky Tap completes selection immediately, with no Step 2", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Lucky Tap" }));

    expect(screen.queryByRole("button", { name: "← Back" })).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/reward expires after/i),
    ).not.toBeInTheDocument();
  });

  it("resets name and reward to blank when a new style is picked", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.type(screen.getByLabelText("Card name"), "My card");
    await user.type(screen.getByLabelText("Reward"), "Free item");

    await user.click(screen.getByRole("button", { name: "Stamp Card" }));
    await user.click(screen.getByRole("button", { name: "Flame Club" }));

    expect(screen.getByLabelText("Card name")).toHaveValue("");
    expect(screen.getByLabelText("Reward")).toHaveValue("");
  });

  it("Flame Club style saves type=stamp with variant=flame and the flame-specific label", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Stamp Card" }));
    await user.click(screen.getByRole("button", { name: "Flame Club" }));
    expect(screen.getByText("Visits for full blaze")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Card name"), "Coffee card");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("type")).toBe("stamp");
    expect(submitted.get("variant")).toBe("flame");
  });

  it("Points Club style saves type=stamp with variant=points, wider range, and points_per_visit", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Stamp Card" }));
    await user.click(screen.getByRole("button", { name: "Points Club" }));
    expect(screen.getByText("Points required")).toBeInTheDocument();
    expect(screen.getByLabelText("Points per visit")).toBeInTheDocument();

    const stampsInput = screen.getByLabelText("Points required");
    await user.clear(stampsInput);
    await user.type(stampsInput, "500");

    const perVisitInput = screen.getByLabelText("Points per visit");
    await user.clear(perVisitInput);
    await user.type(perVisitInput, "20");

    await user.type(screen.getByLabelText("Card name"), "Coffee Points");
    await user.type(screen.getByLabelText("Reward"), "Free drink");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("type")).toBe("stamp");
    expect(submitted.get("variant")).toBe("points");
    expect(submitted.get("stamps_required")).toBe("500");
    expect(submitted.get("points_per_visit")).toBe("20");
  });

  it("Fill the Cup style saves type=plant with variant=cup and the fill-specific label", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Sprout" }));
    await user.click(screen.getByRole("button", { name: "Fill the Cup" }));
    expect(screen.getByText("Visits to fill")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Card name"), "Fill-a-kopi");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("type")).toBe("plant");
    expect(submitted.get("variant")).toBe("cup");
  });

  it("Sprout's Classic style still saves type=plant with variant=plant and the bloom-specific label", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Sprout" }));
    await user.click(screen.getByRole("button", { name: "Classic" }));
    expect(screen.getByText("Visits to bloom")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Card name"), "Grow-a-kopi");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("type")).toBe("plant");
    expect(submitted.get("variant")).toBe("plant");
  });

  it("stamp quick-pick chips set stamps required", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "15" }));
    expect(screen.getByLabelText("Stamps required")).toHaveValue(15);
    expect(screen.getByText("0/15 stamps")).toBeInTheDocument();
  });

  it("shows the type-picker heading and both card-details cards", () => {
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(screen.getByText("Choose a card type")).toBeInTheDocument();
    expect(screen.getByText("Basics")).toBeInTheDocument();
    expect(screen.getByText("Rules")).toBeInTheDocument();
  });

  it("edit mode shows the locked type label and preview together, no picker", () => {
    render(
      <SetupForm
        program={
          {
            id: "p1",
            name: "Coffee card",
            stamps_required: 10,
            reward_text: "Free kopi",
            type: "stamp",
            config: {},
            active: true,
            head_start: false,
            replaced_by: null,
            carry_over_stamps: false,
          } as never
        }
        isEdit
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(screen.getByText("Stamp card")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Lucky Tap" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("0/10 stamps")).toBeInTheDocument();
  });

  it("shows the head-start percent input only for stamp/plant with the toggle on, and submits it", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(
      screen.queryByLabelText("Head start amount"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/give new customers a head start/i));
    const percentInput = screen.getByLabelText("Head start amount");
    expect(percentInput).toHaveValue(20);

    await user.clear(percentInput);
    await user.type(percentInput, "35");
    await user.type(screen.getByLabelText("Card name"), "Coffee card");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("head_start_percent")).toBe("35");
  });
});
```

- [ ] **Step 2: Update the `"SetupForm reward expiry field"` describe block's Lucky Tap test**

Find:

```typescript
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
    await user.click(screen.getByRole("button", { name: "Lucky Tap" }));
    expect(
      screen.queryByLabelText(/reward expires after/i),
    ).not.toBeInTheDocument();
  });
```

This test needs no interaction change — Lucky Tap is still a single click in the new family grid (it has no Step 2) — so leave it exactly as-is. Confirm this by reading the file after Step 1's edit; if it's already correct, no action needed.

- [ ] **Step 3: Run the full test file**

Run: `pnpm exec vitest run src/app/setup/setup-form.dom.test.tsx`
Expected: all tests pass (17 tests: 4 from "SetupForm live preview", 13 from "SetupForm type picker", 2 from "SetupForm reward expiry field")

- [ ] **Step 4: Full gate + commit**

Run: `pnpm check && pnpm test`
Expected: PASS

```bash
git add src/app/setup/setup-form.dom.test.tsx
git commit -m "test(setup): migrate type-picker tests to the two-step family/style flow"
```

---

## Task 4: Manual verification + README/CHANGELOG fallout

**Files:**

- Modify: `src/app/setup/README.md` (add bullets for `card-type-picker.ts`/`card-type-picker.test.ts`; update `setup-form.tsx`'s and `setup-form.dom.test.tsx`'s existing bullets to describe the two-step family/style picker)
- Modify: `CHANGELOG.md` (new `### Changed` bullet under `## [Unreleased]`)

**Interfaces:** none — this task only verifies and documents; no code changes expected unless verification surfaces a bug.

- [ ] **Step 1: Update `src/app/setup/README.md`**

Add a bullet for `card-type-picker.ts` and `card-type-picker.test.ts` (alphabetically, matching this file's existing per-file bullet convention), and update the existing `setup-form.tsx` bullet to mention the two-step family/style picker instead of the flat 8-tile grid, and the existing `setup-form.dom.test.tsx` bullet to mention family/style/Back-link coverage.

- [ ] **Step 2: Add a CHANGELOG entry**

Under `## [Unreleased]` → `### Changed` in `CHANGELOG.md`, add:

```markdown
- `/setup`'s card-type picker now groups its 8 styles into 4 families
  (Stamp Card, Sprout, Chance Card, Lucky Tap) with a style sub-step,
  instead of one flat grid of 8 tiles. Purely a picker UI change — every
  family/style combination still saves the exact same `type`/`variant`
  pair as before (e.g. Stamp Card → Flame Club still saves
  `type=stamp, variant=flame`), so existing programs and the engine are
  unaffected.
```

- [ ] **Step 3: Re-run `pnpm check` to confirm formatting**

Run: `pnpm check`
Expected: PASS

- [ ] **Step 4: Start the dev server**

Run: `pnpm dev`
Expected: server up at http://localhost:3000

- [ ] **Step 5: Manually verify in the browser**

With a vendor account, visit `/setup` (fresh create, or `?prep=<id>`/`?migrate=<id>` for the other picker-showing flows):

- Confirm Step 1 shows exactly 4 tiles: Stamp Card, Sprout, Chance Card, Lucky Tap — no Flame Club/Points Club/Fill the Cup/Spin the Wheel/Scratch Card tiles visible yet.
- Click **Stamp Card** — confirm it swaps to 3 style tiles (Classic, Flame Club, Points Club) plus a "← Back" link, and the rest of the form (name/reward/rules) still updates live as before.
- Click **← Back** — confirm it returns to the 4 family tiles.
- Click **Stamp Card** again, then **Flame Club** — confirm the live preview switches to the flame view and the numeric field becomes "Visits for full blaze".
- Click **← Back**, then **Sprout** — confirm it shows Classic and Fill the Cup; pick **Fill the Cup** and confirm the preview shows the cup-fill view.
- Click **← Back**, then **Chance Card** — confirm it shows Spin the Wheel and Scratch Card; pick either and confirm the segment editor still renders.
- Click **← Back**, then **Lucky Tap** — confirm selection completes immediately (no Step 2, no Back link shown) and the win-chance/pity-ceiling fields render.
- Submit a Flame Club card end-to-end (fill name/reward, create) and confirm it saves and shows correctly on `/dashboard` and the customer `/c` view — this is the "no DB behavior changed" check.

- [ ] **Step 6: Stop the dev server, run the full suite one final time**

Run: `pnpm check && pnpm test`
Expected: PASS

- [ ] **Step 7: Commit README/CHANGELOG fallout**

```bash
git add src/app/setup/README.md CHANGELOG.md
git commit -m "docs(setup): document the card-type family picker"
```
