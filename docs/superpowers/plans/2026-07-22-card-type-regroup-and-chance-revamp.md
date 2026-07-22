# Card Type Regroup + Chance Card Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regroup `/setup`'s type-picker families by mechanic/visual metaphor instead of raw DB `type`, show Chance Card odds as a live percentage, give the `/setup` preview a spin/scratch reveal animation synced to the win/lose signal, and give Lucky Tap a new chance-style visual.

**Architecture:** Four independent, sequential phases, each its own feature branch/PR per this repo's git workflow (never commit to `main` directly). Phase A is a pure data/test regroup with zero production-code behavior change outside the picker. Phase B adds a pure percentage helper plus a UI-only editor change. Phase C reworks `usePreviewAnimation`'s phase state machine and wires two existing-but-unused component props. Phase D adds a new `ProgressView` discriminant and a new component, then wires it into both the `/setup` preview and the real customer-facing `/c` card — this phase changes live production rendering for any vendor with an active Lucky Tap program today, not just the preview.

**Tech Stack:** Next.js 16, React 19 (`useState`/`useEffect`/`useMemo`), TypeScript strict, Tailwind v4, Vitest + `@testing-library/react` (`@vitest-environment jsdom`), `lucide-react` icons.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- Zero DB `type`/`variant` value changes anywhere in this plan except adding a brand-new `ProgressView` discriminant (`kind: "lucky"`) — Phase D does not touch the `lucky` DB `type` value itself, only what `lucky.ts`'s `progress()` returns.
- Every task ends with `pnpm check` (prettier + eslint + tsc) and the relevant `pnpm exec vitest --run <file>` passing before commit.
- Every changed folder's `README.md` must be part of the same diff (readme-freshness CI gate) — each task's steps include the README line(s) to update.
- Points Club's redemption-model redesign is explicitly out of scope — do not touch `stampStrategy`'s `points` variant beyond what Phase A's family regroup requires (zero behavior change, family membership only).
- Follow this repo's git workflow for each phase: branch from up-to-date `main`, commit, push, open a PR, wait for CI green, merge with `--delete-branch`, `git fetch -p` to clean up.

---

## Phase A — Family/style taxonomy regroup

### Task 1: Regroup `card-type-picker.ts`'s families

**Files:**

- Modify: `src/app/setup/card-type-picker.ts`
- Modify: `src/app/setup/card-type-picker.test.ts`
- Modify: `src/app/setup/README.md` (update the `card-type-picker.ts`/`card-type-picker.test.ts` entries' family list)

**Interfaces:**

- Produces: `FamilyKey = "stamp" | "growth" | "points" | "chance"` (was `"stamp" | "plant" | "chance" | "lucky"`). `FAMILIES`, `familyOf`, `isSingleStyleFamily`, `resolveFamilyAndStyle`, `styleToTypeAndVariant` keep their existing exported signatures — only `FAMILIES`'s data and `resolveFamilyAndStyle`'s mapping change. `StyleKey` is unchanged (`"dots" | "flame" | "points" | "plant" | "cup" | "wheel" | "scratch" | "lucky"`).

- [ ] **Step 1: Write the failing test — replace `card-type-picker.test.ts` entirely**

```ts
import { describe, it, expect } from "vitest";
import {
  FAMILIES,
  familyOf,
  isSingleStyleFamily,
  resolveFamilyAndStyle,
  styleToTypeAndVariant,
} from "./card-type-picker";

describe("FAMILIES", () => {
  it("has exactly 4 families in order: stamp, growth, points, chance", () => {
    expect(FAMILIES.map((f) => f.key)).toEqual([
      "stamp",
      "growth",
      "points",
      "chance",
    ]);
  });

  it("stamp has 1 style, growth has 3, points has 1, chance has 3", () => {
    expect(familyOf("stamp").styles).toHaveLength(1);
    expect(familyOf("growth").styles).toHaveLength(3);
    expect(familyOf("points").styles).toHaveLength(1);
    expect(familyOf("chance").styles).toHaveLength(3);
  });
});

describe("isSingleStyleFamily", () => {
  it("is true only for stamp and points", () => {
    expect(isSingleStyleFamily("stamp")).toBe(true);
    expect(isSingleStyleFamily("points")).toBe(true);
    expect(isSingleStyleFamily("growth")).toBe(false);
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

  it("maps stamp/flame to the growth family", () => {
    expect(resolveFamilyAndStyle("stamp", "flame")).toEqual({
      family: "growth",
      style: "flame",
    });
  });

  it("maps stamp/points to the points family", () => {
    expect(resolveFamilyAndStyle("stamp", "points")).toEqual({
      family: "points",
      style: "points",
    });
  });

  it("maps plant with no/'plant' variant and 'cup' variant to the growth family", () => {
    expect(resolveFamilyAndStyle("plant", undefined)).toEqual({
      family: "growth",
      style: "plant",
    });
    expect(resolveFamilyAndStyle("plant", "plant")).toEqual({
      family: "growth",
      style: "plant",
    });
    expect(resolveFamilyAndStyle("plant", "cup")).toEqual({
      family: "growth",
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

  it("maps lucky to the chance family", () => {
    expect(resolveFamilyAndStyle("lucky", undefined)).toEqual({
      family: "chance",
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

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest --run src/app/setup/card-type-picker.test.ts`
Expected: FAIL — `FAMILIES.map((f) => f.key)` still returns `["stamp", "plant", "chance", "lucky"]`, several `resolveFamilyAndStyle` assertions mismatch (e.g. `stamp`/`flame` still resolves to `{family: "stamp", ...}` not `{family: "growth", ...}`).

- [ ] **Step 3: Update `card-type-picker.ts`'s `FamilyKey` type, `FAMILIES`, and `resolveFamilyAndStyle`**

Replace the `FamilyKey` type:

```ts
export type FamilyKey = "stamp" | "growth" | "points" | "chance";
```

Replace the `FAMILIES` array:

```ts
export const FAMILIES: Family[] = [
  {
    key: "stamp",
    label: "Stamp Card",
    description: "Collect stamps toward a reward",
    styles: [
      {
        key: "dots",
        label: "Stamp Card",
        description: "Collect stamps toward a reward",
      },
    ],
  },
  {
    key: "growth",
    label: "Growth",
    description: "Visible progress that grows or fills with every visit",
    styles: [
      {
        key: "flame",
        label: "Flame Club",
        description: "Build a flame with every visit",
      },
      {
        key: "plant",
        label: "Sprout",
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
    key: "points",
    label: "Points Club",
    description: "Earn points toward a reward",
    styles: [
      {
        key: "points",
        label: "Points Club",
        description: "Earn a set number of points every visit",
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
      {
        key: "lucky",
        label: "Lucky Tap",
        description: "A chance to win on every visit",
      },
    ],
  },
];
```

Replace `resolveFamilyAndStyle`:

```ts
export function resolveFamilyAndStyle(
  type: string,
  variant: string | undefined,
): { family: FamilyKey; style: StyleKey } {
  if (type === "stamp") {
    if (variant === "flame") return { family: "growth", style: "flame" };
    if (variant === "points") return { family: "points", style: "points" };
    return { family: "stamp", style: "dots" };
  }
  if (type === "plant") {
    if (variant === "cup") return { family: "growth", style: "cup" };
    return { family: "growth", style: "plant" };
  }
  if (type === "wheel") return { family: "chance", style: "wheel" };
  if (type === "scratch") return { family: "chance", style: "scratch" };
  return { family: "chance", style: "lucky" };
}
```

Leave `STYLE_TO_TYPE_VARIANT`, `styleToTypeAndVariant`, `familyOf`, and `isSingleStyleFamily` exactly as they are — no code change needed, they're purely data-driven off `FAMILIES`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest --run src/app/setup/card-type-picker.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Update `src/app/setup/README.md`**

In the `card-type-picker.ts` bullet, change "4 vendor-facing families (Stamp Card, Sprout, Chance Card, Lucky Tap)" to "4 vendor-facing families (Stamp Card, Growth, Points Club, Chance Card)". In the `card-type-picker.test.ts` bullet, update "4-family/per-family-style-count shape" and "`isSingleStyleFamily` (true only for Lucky Tap)" to "true only for Stamp Card and Points Club".

- [ ] **Step 6: Run the full check gate**

Run: `pnpm check`
Expected: prettier/eslint/tsc all clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/setup/card-type-picker.ts src/app/setup/card-type-picker.test.ts src/app/setup/README.md
git commit -m "refactor(setup): regroup type-picker families by mechanic, not DB type

Flame Club and Sprout/Fill the Cup share a growth-visual metaphor
(counter/growth-state respectively, but both read as \"progress that
grows or fills\") -- move Flame Club out of Stamp Card into a renamed
Growth family alongside Sprout and Fill the Cup. Points Club becomes
its own single-style family instead of living under Stamp Card. Lucky
Tap moves from its own standalone family into Chance Card alongside
Wheel/Scratch, since all three are random-draw-per-visit mechanics.
Zero DB type/variant values change -- family is a UI-only grouping."
```

---

### Task 2: Update `setup-form.dom.test.tsx` for the new family/style flow

No production code in `setup-form.tsx` changes in this task — it already renders generically off `FAMILIES`/`familyOf`/`resolveFamilyAndStyle`, so Task 1's data change alone is enough to make the picker itself correct. This task only updates the consumer tests that click through specific family/style labels, which are now wrong after Task 1.

**Files:**

- Modify: `src/app/setup/setup-form.dom.test.tsx`

**Interfaces:**

- Consumes: Task 1's new `FAMILIES` shape (Stamp Card/Growth/Points Club/Chance Card, styles as listed above).

- [ ] **Step 1: Run the existing suite to see it fail against the new data**

Run: `pnpm exec vitest --run src/app/setup/setup-form.dom.test.tsx`
Expected: FAIL — e.g. "clicking a multi-style family shows its styles and a Back link" fails because clicking "Stamp Card" no longer opens Step 2 (it's single-style now); "Flame Club style saves type=stamp with variant=flame..." fails because "Flame Club" isn't inside "Stamp Card" anymore; "clicking Lucky Tap completes selection immediately, with no Step 2" fails because "Lucky Tap" is no longer a top-level family button.

- [ ] **Step 2: Replace the `SetupForm type picker` describe block's contents**

Replace the entire `describe("SetupForm type picker", ...)` block (everything between its opening line and its closing `});`) with:

```ts
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
    expect(screen.getByRole("button", { name: "Growth" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Points Club" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Chance Card" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Flame Club" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Spin the Wheel" }),
    ).not.toBeInTheDocument();
  });

  it("clicking a multi-style family (Growth) shows its styles and a Back link", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Growth" }));

    expect(
      screen.getByRole("button", { name: "Flame Club" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sprout" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fill the Cup" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "← Back" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Growth" }),
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
    await user.click(screen.getByRole("button", { name: "Growth" }));
    await user.click(screen.getByRole("button", { name: "← Back" }));

    expect(
      screen.getByRole("button", { name: "Stamp Card" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Growth" })).toBeInTheDocument();
  });

  it("clicking Points Club (single-style) completes selection immediately, with no Step 2", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Points Club" }));

    expect(
      screen.queryByRole("button", { name: "← Back" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Points required")).toBeInTheDocument();
  });

  it("clicking Chance Card shows Spin the Wheel, Scratch Card, and Lucky Tap styles", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Chance Card" }));

    expect(
      screen.getByRole("button", { name: "Spin the Wheel" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Scratch Card" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Lucky Tap" }),
    ).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Growth" }));
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
    await user.click(screen.getByRole("button", { name: "Growth" }));
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
    await user.click(screen.getByRole("button", { name: "Growth" }));
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

  it("Growth family's Sprout style still saves type=plant with variant=plant and the bloom-specific label", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Growth" }));
    await user.click(screen.getByRole("button", { name: "Sprout" }));
    expect(screen.getByText("Visits to bloom")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Card name"), "Grow-a-kopi");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("type")).toBe("plant");
    expect(submitted.get("variant")).toBe("plant");
  });

  it("Spin the Wheel style shows segment rows, the odds-weight tooltip, and saves segments", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Chance Card" }));
    await user.click(screen.getByRole("button", { name: "Spin the Wheel" }));

    expect(screen.getByText("Wheel segments")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "What the number next to each prize means",
      }),
    );
    expect(
      screen.getByText(/higher numbers land more often/i),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Card name"), "Spin to win");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("type")).toBe("wheel");
    expect(JSON.parse(submitted.get("segments") as string)).toHaveLength(2);
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
    expect(screen.getAllByText("0/15 stamps")[0]).toBeInTheDocument();
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
    expect(screen.getAllByText("0/10 stamps")[0]).toBeInTheDocument();
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

- [ ] **Step 3: Update the `hides the reward-expiry field for a lucky card` test**

In the `describe("SetupForm reward expiry field", ...)` block, replace:

```ts
await user.click(screen.getByRole("button", { name: "Lucky Tap" }));
```

with:

```ts
await user.click(screen.getByRole("button", { name: "Chance Card" }));
await user.click(screen.getByRole("button", { name: "Lucky Tap" }));
```

- [ ] **Step 4: Run the full file to verify it passes**

Run: `pnpm exec vitest --run src/app/setup/setup-form.dom.test.tsx`
Expected: PASS — all cases green (this file has no production-code dependency changes, so a pass here confirms Task 1's regroup didn't silently break anything else in the form).

- [ ] **Step 5: Commit**

```bash
git add src/app/setup/setup-form.dom.test.tsx
git commit -m "test(setup): update type-picker tests for the Stamp/Growth/Points/Chance regroup"
```

---

### Phase A wrap-up

- [ ] Update `CHANGELOG.md`'s `[Unreleased]` → `### Changed` with an entry describing the regroup (Flame Club/Sprout/Fill the Cup → Growth; Points Club → own family; Lucky Tap → Chance Card).
- [ ] Run `pnpm check && pnpm test` one final time.
- [ ] Push, open a PR titled something like `refactor(setup): regroup type-picker families by mechanic`, wait for CI green, merge with `--delete-branch`, `git fetch -p`.

---

## Phase B — Chance Card Basics: odds as a live percentage

### Task 3: Add `segmentWinPercent`/`overallWinPercent` to `program-config.ts`

**Files:**

- Modify: `src/lib/program-config.ts`
- Create: `test/lib/program-config.test.ts`
- Modify: `src/lib/README.md` (extend the `program-config.ts` bullet)

**Interfaces:**

- Produces: `segmentWinPercent(segments: SegmentInput[]): number[]` (each segment's rounded `weight / totalWeight * 100`, same order as input), `overallWinPercent(segments: SegmentInput[]): number` (rounded percentage of total weight held by `is_reward` segments). Both use the existing exported `SegmentInput` type already in this file.

- [ ] **Step 1: Write the failing test — create `test/lib/program-config.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { segmentWinPercent, overallWinPercent } from "@/lib/program-config";

describe("segmentWinPercent", () => {
  it("computes each segment's share of the total weight, rounded", () => {
    const segments = [
      { label: "Try again", weight: 5, is_reward: false },
      { label: "Free item", weight: 1, is_reward: true },
    ];
    expect(segmentWinPercent(segments)).toEqual([83, 17]);
  });

  it("returns 0 for every segment when total weight is 0", () => {
    expect(
      segmentWinPercent([{ label: "x", weight: 0, is_reward: false }]),
    ).toEqual([0]);
  });
});

describe("overallWinPercent", () => {
  it("sums only the reward segments' weight share", () => {
    const segments = [
      { label: "Try again", weight: 6, is_reward: false },
      { label: "10% off", weight: 3, is_reward: true },
      { label: "Free drink", weight: 1, is_reward: true },
    ];
    expect(overallWinPercent(segments)).toBe(40);
  });

  it("returns 0 when no segment is a reward", () => {
    const segments = [
      { label: "Try again", weight: 5, is_reward: false },
      { label: "Also try again", weight: 5, is_reward: false },
    ];
    expect(overallWinPercent(segments)).toBe(0);
  });

  it("returns 0 when total weight is 0", () => {
    expect(
      overallWinPercent([{ label: "x", weight: 0, is_reward: false }]),
    ).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest --run test/lib/program-config.test.ts`
Expected: FAIL — `segmentWinPercent`/`overallWinPercent` are not exported from `@/lib/program-config`.

- [ ] **Step 3: Add the two functions to `src/lib/program-config.ts`**

Add at the end of the file, after `buildChanceConfig`:

```ts
// Each segment's actual win share, and the pool's overall win chance — the
// same weight/totalWeight math pickSegment (src/lib/engine/chance.ts)
// already uses internally to pick a winner, surfaced here for display in
// the Basics segment editor so a raw odds-weight number isn't the only
// thing a vendor sees.
export function segmentWinPercent(segments: SegmentInput[]): number[] {
  const total = segments.reduce((sum, s) => sum + s.weight, 0);
  if (total === 0) return segments.map(() => 0);
  return segments.map((s) => Math.round((s.weight / total) * 100));
}

export function overallWinPercent(segments: SegmentInput[]): number {
  const total = segments.reduce((sum, s) => sum + s.weight, 0);
  if (total === 0) return 0;
  const rewardWeight = segments
    .filter((s) => s.is_reward)
    .reduce((sum, s) => sum + s.weight, 0);
  return Math.round((rewardWeight / total) * 100);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest --run test/lib/program-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `src/lib/README.md`**

In the `program-config.ts` bullet, append: "; `segmentWinPercent`/`overallWinPercent` (pure, same weight math `chance.ts`'s `pickSegment` uses internally) surface a segment pool's actual win odds as percentages for the Basics segment editor."

- [ ] **Step 6: Run the full check gate and commit**

```bash
pnpm check
git add src/lib/program-config.ts test/lib/program-config.test.ts src/lib/README.md
git commit -m "feat(program-config): add segmentWinPercent/overallWinPercent helpers"
```

---

### Task 4: Show odds as a live percentage in the segment editor

**Files:**

- Modify: `src/app/setup/setup-form.tsx`
- Modify: `src/app/setup/setup-form.dom.test.tsx`

**Interfaces:**

- Consumes: `segmentWinPercent`/`overallWinPercent` from Task 3 (`@/lib/program-config`).

- [ ] **Step 1: Write the failing assertions — extend the Spin the Wheel test in `setup-form.dom.test.tsx`**

In the `"Spin the Wheel style shows segment rows, the odds-weight tooltip, and saves segments"` test, right after the existing `expect(screen.getByText("Wheel segments")).toBeInTheDocument();` line, add:

```ts
expect(screen.getByText("Overall win chance: 17%")).toBeInTheDocument();
expect(screen.getByText("≈83%")).toBeInTheDocument();
expect(screen.getByText("≈17%")).toBeInTheDocument();
```

(`DEFAULT_SEGMENTS` is `[{weight: 5, is_reward: false}, {weight: 1, is_reward: true}]` — total weight 6, so 5/6→83%, 1/6→17%, overall win chance is the reward segment's 17%.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest --run src/app/setup/setup-form.dom.test.tsx`
Expected: FAIL — "Overall win chance: 17%" / "≈83%" / "≈17%" not found; the segment editor doesn't render them yet.

- [ ] **Step 3: Import the helpers and compute derived odds in `setup-form.tsx`**

Add to the import from `@/lib/program-config` — there isn't one yet, so add a new import line right after the `card-type-picker` import block:

```tsx
import { segmentWinPercent, overallWinPercent } from "@/lib/program-config";
```

Right after the `segments` state declaration (`const [segments, setSegments] = useState<SegmentInput[]>(...)`), add:

```tsx
const segmentOddsPercent = segmentWinPercent(segments);
const overallOddsPercent = overallWinPercent(segments);
```

- [ ] **Step 4: Update the segment editor JSX**

Replace the wheel/scratch segment editor block (the `<div className="space-y-2">` containing the `Label`/`InfoTooltip` header down through the closing `</div>` before the pity-ceiling field) with:

```tsx
<div className="space-y-2">
  <div className="flex items-center gap-1.5">
    <Label className={labelClass}>
      {type === "wheel" ? "Wheel segments" : "Scratch prizes"}
    </Label>
    <InfoTooltip label="What the number next to each prize means">
      That&apos;s the odds weight — higher numbers land more often relative to
      the other prizes.
    </InfoTooltip>
  </div>
  <p className="text-sm font-semibold text-muted-foreground">
    Overall win chance: {overallOddsPercent}%
  </p>
  <div className="space-y-2">
    {segments.map((segment, i) => (
      <div key={i} className="space-y-1.5 rounded-xl border p-2">
        <div className="flex items-center gap-2">
          <Input
            type="text"
            required
            maxLength={40}
            value={segment.label}
            onChange={(e) => updateSegment(i, { label: e.target.value })}
            placeholder="Label"
            className="h-11 flex-1 rounded-xl"
          />
          <button
            type="button"
            onClick={() => removeSegment(i)}
            disabled={segments.length <= 2}
            className="h-11 shrink-0 rounded-xl border px-3 text-xs font-semibold text-muted-foreground hover:bg-muted/50 disabled:opacity-40"
          >
            Remove
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            required
            min={1}
            max={100}
            value={segment.weight}
            onChange={(e) =>
              updateSegment(i, {
                weight: Number(e.target.value),
              })
            }
            aria-label="Odds weight"
            className="h-11 w-20 rounded-xl"
          />
          <span className="text-xs font-medium text-muted-foreground">
            ≈{segmentOddsPercent[i]}%
          </span>
          <button
            type="button"
            onClick={() =>
              updateSegment(i, {
                is_reward: !segment.is_reward,
              })
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
        </div>
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
  <input type="hidden" name="segments" value={JSON.stringify(segments)} />
</div>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest --run src/app/setup/setup-form.dom.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full check gate, update `src/app/setup/README.md`, and commit**

In `src/app/setup/README.md`'s `setup-form.tsx` bullet, append a clause noting the segment editor now shows a live win-percentage per segment plus an overall win-chance line, computed via `program-config.ts`'s `segmentWinPercent`/`overallWinPercent`.

```bash
pnpm check
git add src/app/setup/setup-form.tsx src/app/setup/setup-form.dom.test.tsx src/app/setup/README.md
git commit -m "feat(setup): show Chance Card odds as a live percentage, not a raw weight"
```

---

### Phase B wrap-up

- [ ] Update `CHANGELOG.md`.
- [ ] `pnpm check && pnpm test`.
- [ ] Push, PR, CI green, merge, `git fetch -p`.

---

## Phase C — `/setup` preview: spin/scratch reveal animation

### Task 5: Add a `"revealing"` sub-phase to `usePreviewAnimation`

**Files:**

- Modify: `src/app/setup/preview-animation.ts`
- Modify: `src/app/setup/preview-animation.dom.test.tsx`

**Interfaces:**

- Produces: `usePreviewAnimation`'s return type grows a `revealing: boolean` field alongside the existing `progress`/`celebrating`/`lastChanceResult`. During `revealing`, `progress.view`'s `landedId` (when `view.kind === "chance"`) is forced to `null` regardless of the underlying card state.

- [ ] **Step 1: Write the failing tests — add to `preview-animation.dom.test.tsx`**

Add these new `it` blocks inside the existing `describe("usePreviewAnimation", ...)`:

```ts
it("enters a revealing phase after a tick, delaying the win/lose result", () => {
  const rollSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
  const { result } = renderHook(() =>
    usePreviewAnimation({ ...base, type: "wheel", pityCeiling: undefined }),
  );

  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(result.current.revealing).toBe(true);
  expect(result.current.lastChanceResult).toBeNull();

  act(() => {
    vi.advanceTimersByTime(1400);
  });
  expect(result.current.revealing).toBe(false);
  expect(result.current.lastChanceResult).toEqual({ won: true });
  rollSpy.mockRestore();
});

it("masks landedId to null while revealing", () => {
  const rollSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
  const { result } = renderHook(() =>
    usePreviewAnimation({ ...base, type: "wheel", pityCeiling: undefined }),
  );

  act(() => {
    vi.advanceTimersByTime(2000);
  });
  if (result.current.progress.view.kind !== "chance") {
    throw new Error("expected chance view");
  }
  expect(result.current.progress.view.landedId).toBeNull();
  rollSpy.mockRestore();
});

it("never enters the revealing phase under prefers-reduced-motion", () => {
  mockMatchMedia(true);
  const { result } = renderHook(() =>
    usePreviewAnimation({ ...base, type: "wheel", pityCeiling: undefined }),
  );
  act(() => {
    vi.advanceTimersByTime(10000);
  });
  expect(result.current.revealing).toBe(false);
});
```

Then update the 3 existing tests that assert `lastChanceResult` right after a single 2000ms tick — they now need the extra `REVEAL_MS` (1400ms) advance before the result is committed. Change:

```ts
it("sets lastChanceResult when a wheel spin wins", () => {
  const rollSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
  const { result } = renderHook(() =>
    usePreviewAnimation({ ...base, type: "wheel", pityCeiling: undefined }),
  );

  act(() => {
    vi.advanceTimersByTime(2000);
  });

  act(() => {
    vi.advanceTimersByTime(1400);
  });
  expect(result.current.lastChanceResult).toEqual({ won: true });
  rollSpy.mockRestore();
});

it("sets lastChanceResult when a wheel spin loses", () => {
  const rollSpy = vi.spyOn(Math, "random").mockReturnValue(0.1);
  const { result } = renderHook(() =>
    usePreviewAnimation({ ...base, type: "wheel", pityCeiling: undefined }),
  );

  act(() => {
    vi.advanceTimersByTime(2000);
  });

  act(() => {
    vi.advanceTimersByTime(1400);
  });
  expect(result.current.lastChanceResult).toEqual({ won: false });
  rollSpy.mockRestore();
});

it("sets lastChanceResult for scratch the same way as wheel", () => {
  const rollSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
  const { result } = renderHook(() =>
    usePreviewAnimation({
      ...base,
      type: "scratch",
      pityCeiling: undefined,
    }),
  );

  act(() => {
    vi.advanceTimersByTime(2000);
  });

  act(() => {
    vi.advanceTimersByTime(1400);
  });
  expect(result.current.lastChanceResult).toEqual({ won: true });
  rollSpy.mockRestore();
});
```

And in `"resets lastChanceResult to null when the recipe changes"`, insert an extra advance before its first assertion:

```ts
act(() => {
  vi.advanceTimersByTime(2000);
});

act(() => {
  vi.advanceTimersByTime(1400);
});
expect(result.current.lastChanceResult).toEqual({ won: true });
```

(the rest of that test — the `rerender` and the null re-check — is unchanged).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest --run src/app/setup/preview-animation.dom.test.tsx`
Expected: FAIL — `result.current.revealing` is `undefined` (property doesn't exist yet); the updated win/lose tests fail because `lastChanceResult` is currently set at the 2000ms mark, not after an additional 1400ms.

- [ ] **Step 3: Implement the `"revealing"` phase in `preview-animation.ts`**

Add `REVEAL_MS` alongside the existing constants:

```ts
const TICK_MS = 2000;
const CELEBRATE_MS = 2000;
const REVEAL_MS = 1400;
```

Change the phase state type and add `pendingReveal` state:

```ts
const [phase, setPhase] = useState<"ticking" | "revealing" | "celebrating">(
  "ticking",
);
const [lastChanceResult, setLastChanceResult] = useState<{
  won: boolean;
} | null>(null);
const [pendingReveal, setPendingReveal] = useState<{
  card: CardLike;
  won: boolean;
} | null>(null);
```

In the recipe-change reset effect, add `setPendingReveal(null);` alongside the existing resets:

```ts
useEffect(() => {
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setCard(initialCard);
  setSimulatedNow(new Date());
  setPhase("ticking");
  setLastChanceResult(null);
  setPendingReveal(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [recipeKey]);
```

Replace the main tick effect:

```ts
useEffect(() => {
  if (reducedMotion) return;
  const isChance = type === "wheel" || type === "scratch";
  const delay =
    phase === "celebrating"
      ? CELEBRATE_MS
      : phase === "revealing"
        ? REVEAL_MS
        : TICK_MS;
  const timer = setTimeout(() => {
    if (phase === "celebrating") {
      setCard(initialCard);
      setSimulatedNow(new Date());
      setPhase("ticking");
      return;
    }
    if (phase === "revealing" && pendingReveal) {
      setCard(pendingReveal.card);
      setLastChanceResult({ won: pendingReveal.won });
      setPendingReveal(null);
      setPhase(pendingReveal.won ? "celebrating" : "ticking");
      return;
    }
    const nextNow = new Date();
    const event: EngineEvent = {
      kind: "visit",
      payload: { roll: Math.random() },
    };
    const { state, rewardUnlocked } = applyVisit(program, card, event, nextNow);
    const nextCard = { ...card, state };
    setSimulatedNow(nextNow);
    if (isChance) {
      setPendingReveal({ card: nextCard, won: rewardUnlocked });
      setPhase("revealing");
      return;
    }
    setCard(nextCard);
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
  pendingReveal,
]);
```

Replace the two return blocks at the end of the function:

```ts
if (reducedMotion) {
  return {
    progress: buildPreviewProgress(input),
    celebrating: false,
    revealing: false,
    lastChanceResult: null,
  };
}

const progress = getProgress(program, card, simulatedNow);
const revealing = phase === "revealing";
const maskedProgress: Progress =
  revealing && progress.view.kind === "chance"
    ? { ...progress, view: { ...progress.view, landedId: null } }
    : progress;

return {
  progress: maskedProgress,
  celebrating: phase === "celebrating",
  revealing,
  lastChanceResult,
};
```

Update the function's return type annotation:

```ts
export function usePreviewAnimation(input: PreviewInput): {
  progress: Progress;
  celebrating: boolean;
  revealing: boolean;
  lastChanceResult: { won: boolean } | null;
} {
```

Update the header comment above `usePreviewAnimation` (currently explaining the 2s-tick simulation) to also mention the reveal delay:

```ts
// Drives the real applyVisit()/getProgress() engine functions on a timer, so
// the /setup preview simulates a customer actually visiting every 2 seconds
// instead of showing one static snapshot. Every tick is a genuine visit
// event through the same engine src/app/c's real customer page uses — the
// animation can never show a transition a real card couldn't actually
// produce. Wheel/scratch ticks hold the rolled result back for REVEAL_MS
// (masking landedId to null via `revealing`) so the /setup preview can play
// a spin/scratch anticipation animation before the win/lose signal commits
// — there's no equivalent delay on the real customer card, since that roll
// already happened server-side at scan time; this delay is presentation-only.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest --run src/app/setup/preview-animation.dom.test.tsx`
Expected: PASS — all cases green, including the 3 updated win/lose tests and the 3 new revealing-phase tests.

- [ ] **Step 5: Run the full check gate, update `src/app/setup/README.md`, and commit**

In `src/app/setup/README.md`'s `preview-animation.ts` bullet, append: "; for wheel/scratch ticks, holds the rolled result back for a `REVEAL_MS` (1400ms) `revealing` sub-phase (masking `landedId` to `null`) so the preview can play a spin/scratch anticipation animation before the win/lose signal commits — presentation-only, the real customer card has no equivalent delay since the roll already happened server-side at scan time."

```bash
pnpm check
git add src/app/setup/preview-animation.ts src/app/setup/preview-animation.dom.test.tsx src/app/setup/README.md
git commit -m "feat(setup): add a revealing sub-phase to the preview's wheel/scratch ticks"
```

---

### Task 6: `ScratchCard` scratch-marks reveal animation

**Files:**

- Modify: `src/components/scratch-card.tsx`
- Create: `src/components/scratch-card.dom.test.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/README.md`

**Interfaces:**

- Produces: `ScratchCard` accepts a new `scratching?: boolean` prop (default `false`). When true, renders a `data-testid="scratch-strokes"` container with 5 `.scratch-stroke` elements.

- [ ] **Step 1: Write the failing test — create `src/components/scratch-card.dom.test.tsx`**

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScratchCard } from "./scratch-card";

describe("ScratchCard", () => {
  it("shows the cover text and the prize label underneath", () => {
    render(<ScratchCard revealed={false} label="Free kopi" reward={true} />);
    expect(screen.getByText("Scratch to reveal")).toBeInTheDocument();
    expect(screen.getByText("Free kopi")).toBeInTheDocument();
  });

  it("renders no scratch strokes by default", () => {
    render(<ScratchCard revealed={false} label="Try again" reward={false} />);
    expect(screen.queryByTestId("scratch-strokes")).not.toBeInTheDocument();
  });

  it("renders 5 scratch strokes while scratching", () => {
    render(
      <ScratchCard
        revealed={false}
        scratching
        label="Try again"
        reward={false}
      />,
    );
    const container = screen.getByTestId("scratch-strokes");
    expect(container.querySelectorAll(".scratch-stroke")).toHaveLength(5);
  });

  it("stops rendering scratch strokes once revealed", () => {
    render(
      <ScratchCard
        revealed={true}
        scratching={false}
        label="Free kopi"
        reward={true}
      />,
    );
    expect(screen.queryByTestId("scratch-strokes")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest --run src/components/scratch-card.dom.test.tsx`
Expected: FAIL — `scratching` prop doesn't exist, no `scratch-strokes` testid rendered.

- [ ] **Step 3: Implement the scratch-strokes visual in `scratch-card.tsx`**

Replace the full file:

```tsx
import { useMemo, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

type Stroke = { id: number; top: number; rotate: number; delay: number };

// Randomized per mount, same construction pattern as CardBurst's makePieces
// (src/components/card-burst.tsx) — a fixed count of staggered strokes with
// randomized rotation, passed to the .scratch-stroke keyframe via a CSS
// custom property (--scratch-rotate) rather than an inline `transform`,
// since the keyframe's own `transform` would otherwise win over an inline
// style value for the same property once the animation starts.
function makeStrokes(count: number): Stroke[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    top: 15 + i * (70 / (count - 1)),
    rotate: -20 + Math.random() * 40,
    delay: i * 0.1,
  }));
}

export function ScratchCard({
  revealed,
  scratching = false,
  label,
  reward,
  className,
}: {
  revealed: boolean;
  scratching?: boolean;
  label: string;
  reward: boolean;
  className?: string;
}) {
  const strokes = useMemo(
    () => (scratching ? makeStrokes(5) : []),
    [scratching],
  );

  return (
    <div
      className={cn(
        "relative h-28 w-48 overflow-hidden rounded-xl border",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center gap-1 p-3 text-center",
          reward ? "bg-gold/10" : "bg-muted/40",
        )}
      >
        <p
          className={cn(
            "text-sm font-semibold",
            reward ? "text-gold-accent" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
      </div>
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary to-primary/70 text-sm font-semibold text-primary-foreground motion-safe:transition-opacity motion-safe:duration-500",
          revealed ? "pointer-events-none opacity-0" : "opacity-100",
        )}
      >
        Scratch to reveal
      </div>
      {scratching && (
        <div
          aria-hidden="true"
          data-testid="scratch-strokes"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          {strokes.map((s) => (
            <span
              key={s.id}
              className="scratch-stroke absolute left-1 right-1 h-2 rounded-full bg-primary-foreground/50"
              style={
                {
                  top: `${s.top}%`,
                  animationDelay: `${s.delay}s`,
                  "--scratch-rotate": `${s.rotate}deg`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest --run src/components/scratch-card.dom.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add the `.scratch-stroke` keyframe to `src/app/globals.css`**

After the existing `.card-burst-piece` block (which ends with `animation-fill-mode: forwards;\n}`), add:

```css
/* Scratch Card's reveal-in-progress strokes (ScratchCard, `scratching` prop)
   — a handful of staggered diagonal marks sweeping across the cover before
   the existing opacity-fade reveal plays; disabled under reduced-motion below. */
@keyframes scratch-stroke-sweep {
  0% {
    transform: scaleX(0) rotate(var(--scratch-rotate, 0deg));
    transform-origin: left center;
    opacity: 0;
  }
  40% {
    opacity: 1;
  }
  100% {
    transform: scaleX(1) rotate(var(--scratch-rotate, 0deg));
    transform-origin: left center;
    opacity: 0.9;
  }
}
.scratch-stroke {
  animation: scratch-stroke-sweep 0.35s ease-out both;
}
```

In the existing `@media (prefers-reduced-motion: reduce)` block, add the `.scratch-stroke` override alongside `.card-burst-piece`:

```css
.card-burst-piece {
  animation: none;
  opacity: 0;
}
.scratch-stroke {
  animation: none;
  opacity: 0;
}
```

- [ ] **Step 6: Update `src/components/README.md`**

In the `scratch-card.tsx` bullet, change it to: "`ScratchCard`: two-layer card (reward/label content beneath an opacity-animated \"Scratch to reveal\" overlay) for scratch-variant programs; accepts an optional `scratching` prop rendering a handful of staggered scratch-mark strokes (`.scratch-stroke` keyframe in `globals.css`) over the cover before the existing fade-reveal plays, disabled under reduced-motion." Add a new bullet for the test file: "`scratch-card.dom.test.tsx` — jsdom tests: renders the cover/prize text, no strokes by default, exactly 5 `.scratch-stroke` elements while `scratching`, no strokes once `revealed`."

- [ ] **Step 7: Run the full check gate and commit**

```bash
pnpm check
git add src/components/scratch-card.tsx src/components/scratch-card.dom.test.tsx src/app/globals.css src/components/README.md
git commit -m "feat(scratch-card): add a scratch-marks reveal animation"
```

---

### Task 7: Wire `revealing` into `PreviewCard` → `Wheel`/`ScratchCard`

**Files:**

- Modify: `src/app/setup/preview-card.tsx`
- Modify: `src/app/setup/preview-card.dom.test.tsx`
- Modify: `src/app/setup/setup-form.tsx`

**Interfaces:**

- Consumes: `usePreviewAnimation`'s new `revealing` field (Task 5), `Wheel`'s existing (previously unused) `spinning?: boolean` prop, `ScratchCard`'s new `scratching?: boolean` prop (Task 6).
- Produces: `PreviewCard` accepts a new `revealing?: boolean` prop (default `false`).

- [ ] **Step 1: Write the failing tests — add to `preview-card.dom.test.tsx`**

```ts
  it("passes spinning to Wheel while revealing (before a result lands)", () => {
    const progress: Progress = {
      stage: "play",
      label: "Spin to play",
      view: {
        kind: "chance",
        variant: "wheel",
        segments: [
          { id: "a", label: "Try again", reward: false },
          { id: "b", label: "Free item", reward: true },
        ],
        landedId: null,
      },
      rewardReady: false,
    };
    const { container } = render(
      <PreviewCard
        progress={progress}
        name="Spin to win"
        rewardText="Free item"
        revealing
      />,
    );
    const wheelGroup = container.querySelector("svg g");
    expect(wheelGroup?.getAttribute("class")).toContain(
      "motion-safe:animate-spin",
    );
  });

  it("passes scratching to ScratchCard while revealing", () => {
    const progress: Progress = {
      stage: "play",
      label: "Scratch to reveal",
      view: {
        kind: "chance",
        variant: "scratch",
        segments: [
          { id: "a", label: "Try again", reward: false },
          { id: "b", label: "Free item", reward: true },
        ],
        landedId: null,
      },
      rewardReady: false,
    };
    render(
      <PreviewCard
        progress={progress}
        name="Scratch to win"
        rewardText="Free item"
        revealing
      />,
    );
    expect(screen.getByTestId("scratch-strokes")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest --run src/app/setup/preview-card.dom.test.tsx`
Expected: FAIL — `PreviewCard` doesn't accept/forward a `revealing` prop yet, so `Wheel` never gets `spinning` and `ScratchCard` never gets `scratching`.

- [ ] **Step 3: Update `PreviewCard`'s props and JSX**

Change the function signature:

```tsx
export function PreviewCard({
  progress,
  name,
  rewardText,
  celebrating = false,
  revealing = false,
  lastChanceResult = null,
}: {
  progress: Progress;
  name: string;
  rewardText: string;
  celebrating?: boolean;
  revealing?: boolean;
  lastChanceResult?: { won: boolean } | null;
}) {
```

Update the chance-view branch:

```tsx
        ) : view.kind === "chance" ? (
          view.variant === "wheel" ? (
            <Wheel
              segments={view.segments}
              landedId={view.landedId}
              spinning={revealing}
            />
          ) : (
            <ScratchCard
              scratching={revealing}
              revealed={view.landedId !== null}
              label={
                view.segments.find((s) => s.id === view.landedId)?.label ?? ""
              }
              reward={
                view.segments.find((s) => s.id === view.landedId)?.reward ??
                false
              }
            />
          )
```

- [ ] **Step 4: Forward `revealing` from `setup-form.tsx`**

In `setup-form.tsx`, add `revealing` to the `usePreviewAnimation` destructure:

```tsx
  const {
    progress: previewProgress,
    celebrating,
    revealing,
    lastChanceResult,
  } = usePreviewAnimation({
```

And pass it to `PreviewCard`:

```tsx
const preview = (
  <PreviewCard
    progress={previewProgress}
    name={name}
    rewardText={rewardText}
    celebrating={celebrating}
    revealing={revealing}
    lastChanceResult={lastChanceResult}
  />
);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest --run src/app/setup/preview-card.dom.test.tsx src/app/setup/setup-form.dom.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full check gate, update `src/app/setup/README.md`, and commit**

In `src/app/setup/README.md`'s `preview-card.tsx` bullet, append: "; accepts a new `revealing` prop forwarded from `usePreviewAnimation`, passed to `Wheel` as `spinning` and to `ScratchCard` as `scratching` during the reveal-delay window."

```bash
pnpm check
git add src/app/setup/preview-card.tsx src/app/setup/preview-card.dom.test.tsx src/app/setup/setup-form.tsx src/app/setup/README.md
git commit -m "feat(setup): wire the preview's revealing phase into Wheel spinning / ScratchCard scratching"
```

---

### Phase C wrap-up

- [ ] Update `CHANGELOG.md`.
- [ ] `pnpm check && pnpm test`.
- [ ] Push, PR, CI green, merge, `git fetch -p`.

---

## Phase D — Lucky Tap: new chance-style visual

### Task 8: Add the `"lucky"` `ProgressView` kind and update `lucky.ts`

**Files:**

- Modify: `src/lib/engine/types.ts`
- Modify: `src/lib/engine/lucky.ts`
- Modify: `test/lib/engine/lucky.test.ts`
- Modify: `src/lib/engine/README.md`

**Interfaces:**

- Produces: new `ProgressView` union member `{ kind: "lucky"; visitsSinceWin: number; pityCeiling: number }`. `luckyStrategy.progress()` now returns this instead of `{ kind: "dots", ... }`.

- [ ] **Step 1: Write the failing test — add to `test/lib/engine/lucky.test.ts`**

```ts
it("progress exposes visitsSinceWin/pityCeiling as a lucky view", () => {
  const p = luckyStrategy.progress(
    { visits_since_win: 3, total_wins: 0 },
    cfg,
    now,
  );
  expect(p.view).toEqual({
    kind: "lucky",
    visitsSinceWin: 3,
    pityCeiling: 8,
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest --run test/lib/engine/lucky.test.ts`
Expected: FAIL — `p.view` is still `{ kind: "dots", filled: 3, total: 8 }`, not `{ kind: "lucky", visitsSinceWin: 3, pityCeiling: 8 }`. (The 3-argument `progress(state, cfg, now)` call matches the `Strategy<C, S>` interface's declared signature in `src/lib/engine/types.ts` — `lucky.ts`'s implementation just doesn't use the 3rd parameter, same as how `chance.test.ts` already calls `strategy.progress(state, cfg, now)`.)

- [ ] **Step 3: Update `src/lib/engine/types.ts`**

Add a new member to the `ProgressView` union, after the existing `"chance"` member:

```ts
  | {
      kind: "chance";
      variant: "wheel" | "scratch";
      segments: { id: string; label: string; reward: boolean }[];
      landedId: string | null;
    }
  | {
      kind: "lucky";
      visitsSinceWin: number;
      pityCeiling: number;
    };
```

- [ ] **Step 4: Update `luckyStrategy.progress()` in `src/lib/engine/lucky.ts`**

Replace:

```ts
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
```

with:

```ts
  progress(state, config) {
    return {
      stage: "play",
      label: `Tap to play — win by visit ${config.pity_ceiling}`,
      view: {
        kind: "lucky",
        visitsSinceWin: state.visits_since_win,
        pityCeiling: config.pity_ceiling,
      },
      rewardReady: false,
    };
  },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest --run test/lib/engine/lucky.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full check gate**

Run: `pnpm check`
Expected: clean. TypeScript will flag any other file that exhaustively switches on `ProgressView.kind` without a `"lucky"` branch as a compile error if it's an exhaustive switch — this repo's consumers (`preview-card.tsx`, `program-card-status.tsx`) use `? :` chains ending in `null`, not exhaustive switches, so `tsc` will NOT catch the missing branch there; Task 10 adds those branches explicitly. Confirm `tsc --noEmit` still passes after this task (it should — the new union member alone doesn't break any exhaustive check in this codebase).

- [ ] **Step 7: Update `src/lib/engine/README.md`**

In the `lucky.ts` bullet, note the view kind change: append "; `progress()` returns a `kind: \"lucky\"` view (`visitsSinceWin`/`pityCeiling`), not the generic `dots` counter view stamp/plant use — rendered by `src/components/lucky-box.tsx`, not `StampDots`." In the `types.ts` bullet, extend the `ProgressView` kind list to mention `lucky`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/engine/types.ts src/lib/engine/lucky.ts test/lib/engine/lucky.test.ts src/lib/engine/README.md
git commit -m "feat(engine): give Lucky Tap its own ProgressView kind instead of reusing dots"
```

---

### Task 9: `LuckyBox` component

**Files:**

- Create: `src/components/lucky-box.tsx`
- Create: `src/components/lucky-box.dom.test.tsx`
- Modify: `src/components/README.md`

**Interfaces:**

- Consumes: `visitsSinceWin`/`pityCeiling` (same shape as Task 8's new `ProgressView` member, but taken as direct props — this component doesn't import engine types, matching how `FlameLayers`/`Plant`/`Cup` take plain numeric props rather than a `ProgressView` slice).
- Produces: `LuckyBox({ visitsSinceWin, pityCeiling, className? })`.

- [ ] **Step 1: Write the failing test — create `src/components/lucky-box.dom.test.tsx`**

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LuckyBox } from "./lucky-box";

describe("LuckyBox", () => {
  it("renders the mystery-box prompt and pity progress", () => {
    render(<LuckyBox visitsSinceWin={3} pityCeiling={8} />);
    expect(screen.getByText("Tap for a surprise")).toBeInTheDocument();
    expect(screen.getByText("Guaranteed win by visit 3/8")).toBeInTheDocument();
  });

  it("clamps the displayed progress at the pity ceiling", () => {
    render(<LuckyBox visitsSinceWin={20} pityCeiling={8} />);
    expect(screen.getByText("Guaranteed win by visit 8/8")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest --run src/components/lucky-box.dom.test.tsx`
Expected: FAIL — `./lucky-box` doesn't exist.

- [ ] **Step 3: Create `src/components/lucky-box.tsx`**

```tsx
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// Lucky Tap's mystery-box visual — a "tap for a surprise" prompt, not a
// stamp-style dot grid — since it's now grouped with Wheel/Scratch as a
// Chance-family style (src/app/setup/card-type-picker.ts): all three are
// random-draw-per-visit mechanics and should read as the same kind of card.
// The pity-ceiling progress stays visible as a small caption underneath so
// the guaranteed-win-by information isn't lost, just no longer the primary
// visual.
export function LuckyBox({
  visitsSinceWin,
  pityCeiling,
  className,
}: {
  visitsSinceWin: number;
  pityCeiling: number;
  className?: string;
}) {
  const progress = Math.min(visitsSinceWin, pityCeiling);
  return (
    <div
      className={cn(
        "flex h-28 w-28 flex-col items-center justify-center gap-2 rounded-2xl border bg-primary/10",
        className,
      )}
    >
      <Sparkles className="size-8 text-primary" aria-hidden="true" />
      <p className="text-xs font-semibold text-primary">Tap for a surprise</p>
      <p className="text-center text-[0.65rem] text-muted-foreground">
        Guaranteed win by visit {progress}/{pityCeiling}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest --run src/components/lucky-box.dom.test.tsx`
Expected: PASS.

- [ ] **Step 5: Update `src/components/README.md`**

Add two new bullets (alphabetically, after `landing/` and before `plant.dom.test.tsx`): "`lucky-box.dom.test.tsx` — jsdom tests: renders the mystery-box prompt and pity-progress caption, clamps displayed progress at the pity ceiling" and "`lucky-box.tsx` — `LuckyBox`: Lucky Tap's mystery-box \"tap for a surprise\" visual (Sparkles icon + pity-progress caption) — replaces the generic stamp-dots view Lucky Tap used to share with real stamp/plant programs, now that it's grouped as a Chance-family style alongside Wheel/Scratch."

- [ ] **Step 6: Run the full check gate and commit**

```bash
pnpm check
git add src/components/lucky-box.tsx src/components/lucky-box.dom.test.tsx src/components/README.md
git commit -m "feat(lucky-box): add Lucky Tap's new mystery-box visual"
```

---

### Task 10: Wire `LuckyBox` into `PreviewCard` and `ProgramCardStatus`, extend the win/lose pill and `lastChanceResult` to Lucky Tap

**Files:**

- Modify: `src/app/setup/preview-card.tsx`
- Modify: `src/app/setup/preview-card.dom.test.tsx`
- Modify: `src/features/card-check/components/program-card-status.tsx`
- Modify: `src/features/card-check/components/program-card-status.dom.test.tsx`
- Modify: `src/app/setup/preview-animation.ts`
- Modify: `src/app/setup/preview-animation.dom.test.tsx`
- Modify: `src/app/setup/README.md`
- Modify: `src/features/card-check/components/README.md`

**Interfaces:**

- Consumes: `LuckyBox` (Task 9), the `"lucky"` `ProgressView` kind (Task 8).

- [ ] **Step 1: Write the failing test — add to `preview-animation.dom.test.tsx`**

```ts
it("sets lastChanceResult for lucky on a winning tick, same as wheel/scratch", () => {
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
    vi.advanceTimersByTime(2000);
  });
  expect(result.current.lastChanceResult).toEqual({ won: true });
  rollSpy.mockRestore();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest --run src/app/setup/preview-animation.dom.test.tsx`
Expected: FAIL — `lastChanceResult` is still `null` for `type: "lucky"`.

- [ ] **Step 3: Set `lastChanceResult` for lucky in `preview-animation.ts`**

In the main tick effect's non-chance branch (the code after the `if (isChance) { ...; return; }` block), change:

```ts
setCard(nextCard);
if (rewardUnlocked) setPhase("celebrating");
```

to:

```ts
setCard(nextCard);
if (type === "lucky") {
  setLastChanceResult({ won: rewardUnlocked });
}
if (rewardUnlocked) setPhase("celebrating");
```

(Lucky Tap doesn't get the `"revealing"` delay — its mystery-box tap is instant, unlike Wheel/Scratch's spin/scratch anticipation — only `lastChanceResult` is now also set for it, reusing the same win/lose pill Wheel/Scratch already trigger in `PreviewCard`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest --run src/app/setup/preview-animation.dom.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing test — add to `preview-card.dom.test.tsx`**

```ts
  it("renders LuckyBox for a lucky view, with the win/lose pill available", () => {
    const progress: Progress = {
      stage: "play",
      label: "Tap to play — win by visit 8",
      view: { kind: "lucky", visitsSinceWin: 3, pityCeiling: 8 },
      rewardReady: false,
    };
    render(
      <PreviewCard
        progress={progress}
        name="Lucky topping"
        rewardText="Free item"
        lastChanceResult={{ won: true }}
      />,
    );
    expect(screen.getByText("Tap for a surprise")).toBeInTheDocument();
    expect(
      screen.getByText("Guaranteed win by visit 3/8"),
    ).toBeInTheDocument();
    expect(screen.getByText("🎉 You won!")).toBeInTheDocument();
  });
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm exec vitest --run src/app/setup/preview-card.dom.test.tsx`
Expected: FAIL — `PreviewCard` has no branch for `view.kind === "lucky"` yet, and the win/lose pill is gated to `view.kind === "chance"` only.

- [ ] **Step 7: Add the `lucky` branch and extend the pill gate in `preview-card.tsx`**

Add the `LuckyBox` import:

```tsx
import { LuckyBox } from "@/components/lucky-box";
```

Add a new branch in the visual switch, right after the `chance` branch and before the `dots` branch:

```tsx
        ) : view.kind === "lucky" ? (
          <LuckyBox
            visitsSinceWin={view.visitsSinceWin}
            pityCeiling={view.pityCeiling}
          />
        ) : view.kind === "dots" ? (
```

Update the win/lose pill's gating condition:

```tsx
      {(view.kind === "chance" || view.kind === "lucky") &&
        lastChanceResult &&
        showChanceResult && (
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm exec vitest --run src/app/setup/preview-card.dom.test.tsx`
Expected: PASS.

- [ ] **Step 9: Write the failing test — add to `program-card-status.dom.test.tsx`**

```tsx
describe("ProgramCardStatus lucky view", () => {
  it("renders LuckyBox instead of stamp dots for a lucky view", () => {
    render(
      <ProgramCardStatus
        card={baseCard({
          view: { kind: "lucky", visitsSinceWin: 2, pityCeiling: 8 },
        })}
        phone="+6591234567"
      />,
    );
    expect(screen.getByText("Tap for a surprise")).toBeInTheDocument();
    expect(screen.getByText("Guaranteed win by visit 2/8")).toBeInTheDocument();
  });
});
```

This test file doesn't import `screen` yet — check its top-level import and add it if missing: `import { render, screen } from "@testing-library/react";`.

- [ ] **Step 10: Run the test to verify it fails**

Run: `pnpm exec vitest --run src/features/card-check/components/program-card-status.dom.test.tsx`
Expected: FAIL — no `"lucky"` branch in `ProgramCardStatus`, so nothing renders for this view kind (falls through to the final `null`), and "Tap for a surprise" is never found.

- [ ] **Step 11: Add the `lucky` branch to `program-card-status.tsx`**

Add the import:

```tsx
import { LuckyBox } from "@/components/lucky-box";
```

Add a new branch, right after the `chance` branch's closing `)` and before the `dots` branch:

```tsx
      ) : view?.kind === "lucky" ? (
        <div className="flex flex-col items-center gap-2">
          <LuckyBox
            visitsSinceWin={view.visitsSinceWin}
            pityCeiling={view.pityCeiling}
          />
        </div>
      ) : view?.kind === "dots" ? (
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `pnpm exec vitest --run src/features/card-check/components/program-card-status.dom.test.tsx`
Expected: PASS.

- [ ] **Step 13: Run the full check gate**

Run: `pnpm check`
Expected: clean.

- [ ] **Step 14: Update READMEs**

In `src/app/setup/README.md`'s `preview-card.tsx` bullet, append: "; renders `LuckyBox` for a `kind: \"lucky\"` view, and the win/lose pill now also fires for Lucky Tap (not just Wheel/Scratch)." In `src/app/setup/README.md`'s `preview-animation.ts` bullet, append: "; also sets `lastChanceResult` on every lucky tick (previously only wheel/scratch did), since Lucky Tap now shares the same win/lose pill." In `src/features/card-check/components/README.md`'s `program-card-status.tsx` bullet, append: "; renders `LuckyBox` for a `kind: \"lucky\"` view instead of falling through to the generic stamp-dots view."

- [ ] **Step 15: Commit**

```bash
git add src/app/setup/preview-card.tsx src/app/setup/preview-card.dom.test.tsx \
  src/features/card-check/components/program-card-status.tsx \
  src/features/card-check/components/program-card-status.dom.test.tsx \
  src/app/setup/preview-animation.ts src/app/setup/preview-animation.dom.test.tsx \
  src/app/setup/README.md src/features/card-check/components/README.md
git commit -m "feat(lucky-tap): wire LuckyBox into the setup preview and the real customer card"
```

---

### Phase D wrap-up

- [ ] Update `CHANGELOG.md` — call out explicitly that this changes the live customer-facing card for any vendor with an active Lucky Tap program today, not just the `/setup` preview.
- [ ] `pnpm check && pnpm test`.
- [ ] Push, PR, CI green, merge, `git fetch -p`.

---

## Self-Review Notes

- **Spec coverage:** Section A → Tasks 1–2. Section B → Tasks 3–4. Section C → Tasks 5–7. Section D → Tasks 8–10. Points Club redemption redesign is out of scope per the spec and not touched anywhere above.
- **Type consistency:** `revealing` is named identically across `usePreviewAnimation`'s return, `PreviewCard`'s prop, and `setup-form.tsx`'s destructure/forward. `scratching` is named identically across `ScratchCard`'s prop and `PreviewCard`'s usage. `visitsSinceWin`/`pityCeiling` are named identically across the `ProgressView` union member (Task 8), `LuckyBox`'s props (Task 9), and both call sites (Task 10).
- **No placeholders:** every step above shows complete code, not a description of code to write.
