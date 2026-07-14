# /setup page redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse `/setup`'s two-mode template/custom type picker into one flat grid, stop prefilling `name`/`reward_text` with business-flavored copy, add stamp-count quick-pick chips, and restructure the page into a two-column (type picker + preview | card details) layout.

**Architecture:** All changes live in `src/app/setup/setup-form.tsx` (state/handlers in Task 1, layout in Task 2) plus deleting `src/lib/templates.ts` and its test. No server action, schema, or engine changes — this is purely what the form starts pre-filled with and how it's laid out.

**Tech Stack:** Next.js 16 App Router, React (`"use client"`, `useState`), TypeScript strict, Vitest + Testing Library (jsdom).

## Global Constraints

- `src/lib/templates.ts` and `test/lib/templates.test.ts` are deleted entirely — zero remaining references anywhere in the repo (verify with grep).
- The type picker is one flat grid of the 6 mechanics (Stamp card, Lucky Tap, Sprout, Spin the Wheel, Scratch Card, Streak Club) — no template-vs-custom toggle, no "Custom — start from scratch" button.
- Picking a type always resets `name` and `rewardText` to `""` on the create flow — no suggested/prefilled copy ever. Edit/migrate flows are unaffected: they still prefill from the actual existing program's real `name`/`reward_text`.
- Stamp-count quick-pick chips (5 / 10 / 15) set `stampsRequired` on click; the number input stays freely editable either way — no schema change (`stamps_required` already accepts any 2-20 value).
- Layout: two columns at `sm` width and up — left column holds the type picker (grid, or the locked type label in edit mode) with the live preview stacked directly beneath it; right column holds the "Card details" form. Below `sm`: fully stacked single column, order = picker → preview → form.
- Two-tier stamp rewards and vendor-configurable head-start amount are explicitly OUT OF SCOPE for this plan — do not implement either.
- Every task's commit must leave `pnpm check` clean, the full `pnpm test` suite passing, **and `pnpm build` clean** — this file is reachable from a Client Component (`SetupForm` itself), and a prior feature on this same file broke the Vercel build in a way `pnpm check`/`pnpm test` couldn't catch (a `next/headers` import got pulled into the client bundle). Always run an actual `pnpm build` before considering a task done.
- Keep the codebase clean: no leftover `pickerMode`/`selectedTemplateKey`/`pickTemplate`/`pickCustomType`/`TEMPLATES` references after Task 1.

---

### Task 1: Collapse the type picker, blank-reset name/reward, add stamp quick-pick chips

**Files:**

- Delete: `src/lib/templates.ts`
- Delete: `test/lib/templates.test.ts`
- Modify: `src/app/setup/setup-form.tsx`
- Modify: `src/app/setup/setup-form.dom.test.tsx`

**Interfaces:**

- Consumes: nothing new — `buildPreviewProgress` (`@/app/setup/preview-state`) and `PreviewCard` (`@/app/setup/preview-card`) are already imported and unchanged.
- Produces: `pickType(value: ProgramType): void` (replaces `pickTemplate`/`pickCustomType`) and a `TYPE_OPTIONS` constant, both local to `setup-form.tsx`. Task 2 relies on `pickType`, `TYPE_OPTIONS`, and the existing `type`/`name`/`rewardText`/`stampsRequired` state all still existing under these exact names — this task must not rename any of them.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/app/setup/setup-form.dom.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { saveMock } = vi.hoisted(() => ({
  saveMock: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/app/setup/actions", () => ({
  saveProgramAction: saveMock,
  changeTypeAction: vi.fn().mockResolvedValue({}),
  prepProgramAction: vi.fn().mockResolvedValue({}),
}));

import { SetupForm } from "@/app/setup/setup-form";

describe("SetupForm live preview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates the preview on every keystroke", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(screen.getByText("0/10 stamps")).toBeInTheDocument();

    const stampsInput = screen.getByLabelText("Stamps required");
    await user.clear(stampsInput);
    await user.type(stampsInput, "5");

    expect(screen.getByText("0/5 stamps")).toBeInTheDocument();
  });

  it("reflects head-start seeding in the preview when the toggle is on", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByLabelText(/give new customers a head start/i));
    expect(screen.getByText("2/10 stamps")).toBeInTheDocument();
  });

  it("still submits the edited controlled field values", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.type(screen.getByLabelText("Card name"), "Coffee card");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("name")).toBe("Coffee card");
    expect(submitted.get("reward_text")).toBe("Free kopi");
    expect(submitted.get("stamps_required")).toBe("10");
  });
});

describe("SetupForm type picker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a single flat grid of all six types with no template/custom toggle", () => {
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Stamp card" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Lucky Tap" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sprout" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Spin the Wheel" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Scratch Card" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Streak Club" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Custom — start from scratch"),
    ).not.toBeInTheDocument();
  });

  it("resets name and reward to blank when a new type is picked", async () => {
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

    await user.click(screen.getByRole("button", { name: "Streak Club" }));

    expect(screen.getByLabelText("Card name")).toHaveValue("");
    expect(screen.getByLabelText("Reward")).toHaveValue("");
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
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `pnpm vitest run src/app/setup/setup-form.dom.test.tsx`
Expected: the 3 tests under "SetupForm live preview" PASS (unchanged behavior); the 3 new tests under "SetupForm type picker" FAIL — the flat-grid test fails because template tiles ("Cafe Regulars" etc.) render instead of "Stamp card"/"Lucky Tap"/etc.; the reset test fails because picking a template still prefills a name; the chips test fails because `screen.getByRole("button", { name: "15" })` doesn't exist yet.

- [ ] **Step 3: Delete the template system**

```bash
rm "src/lib/templates.ts" "test/lib/templates.test.ts"
```

- [ ] **Step 4: Remove the `TEMPLATES` import and add `TYPE_OPTIONS`**

In `src/app/setup/setup-form.tsx`, remove this line from the imports:

```ts
import { TEMPLATES } from "@/lib/templates";
```

Add this constant directly after the existing `typeLabels` declaration (keep `typeLabels` itself — it's still used for the locked-type label in edit mode):

```ts
const TYPE_OPTIONS = [
  {
    value: "stamp",
    label: "Stamp card",
    description: "Collect stamps toward a reward",
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
    value: "wheel",
    label: "Spin the Wheel",
    description: "Spin for a prize on every visit",
  },
  {
    value: "scratch",
    label: "Scratch Card",
    description: "Scratch for a prize on every visit",
  },
  {
    value: "streak",
    label: "Streak Club",
    description: "Reward a consecutive visit streak",
  },
] as const;
```

- [ ] **Step 5: Replace the picker-mode state and handlers**

Replace this block (the `pickerMode`/`selectedTemplateKey` state declarations, immediately after `const [type, setType] = useState<ProgramType>(initialType);`):

```tsx
// "template" shows the curated grid (the default for both plain create and
// migrate flows); "custom" falls back to today's raw type grid. Only
// meaningful when !isEdit — isEdit always shows the locked static label.
const [pickerMode, setPickerMode] = useState<"template" | "custom">("template");
// Which template tile is selected, or null (custom mode, or no pick yet) —
// used only to highlight the selected tile. Field values themselves are
// set directly by pickTemplate/pickCustomType below, not derived from this.
const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(
  null,
);
```

with nothing — delete it entirely (tile highlighting now keys off `type` directly, no separate selection state needed).

Then replace `pickTemplate`/`pickCustomType`:

```tsx
function pickTemplate(template: (typeof TEMPLATES)[number]) {
  const d = template.defaults;
  setType(template.type);
  setSelectedTemplateKey(template.key);
  setName(d.name);
  setRewardText(d.reward_text);
  if (d.stamps_required !== undefined) setStampsRequired(d.stamps_required);
  if (d.visits_to_bloom !== undefined) setVisitsToBloom(d.visits_to_bloom);
  if (d.win_percent !== undefined) setWinPercent(d.win_percent);
  setPityCeiling(d.pity_ceiling);
  if (d.period_days !== undefined) setPeriodDays(d.period_days);
  if (d.target_streak !== undefined) setTargetStreak(d.target_streak);
}

function pickCustomType(value: ProgramType) {
  setType(value);
  setSelectedTemplateKey(null);
  setName("");
  setRewardText("");
  setStampsRequired(10);
  setVisitsToBloom(6);
  setWinPercent(20);
  setPityCeiling(value === "lucky" ? 8 : undefined);
  setPeriodDays(7);
  setTargetStreak(4);
}
```

with one function:

```tsx
// Sets the type plus its sensible numeric defaults, and always resets
// name/rewardText to blank — the vendor types both themselves, no
// suggested copy is ever prefilled on the create flow.
function pickType(value: ProgramType) {
  setType(value);
  setName("");
  setRewardText("");
  setStampsRequired(10);
  setVisitsToBloom(6);
  setWinPercent(20);
  setPityCeiling(value === "lucky" ? 8 : undefined);
  setPeriodDays(7);
  setTargetStreak(4);
}
```

- [ ] **Step 6: Replace the type-picker JSX with the flat grid**

Replace this entire block (the `<div className="space-y-2">` containing `<Label>Card type</Label>` through its closing `</div>`, immediately before the `{type === "stamp" ? (` field block):

```tsx
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
                <span className="text-sm font-semibold">{template.label}</span>
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
```

with:

```tsx
<div className="space-y-2">
  <Label className={labelClass}>Card type</Label>
  {isEdit ? (
    <p className="flex h-11 items-center rounded-xl border bg-muted/40 px-3 text-sm font-semibold text-muted-foreground">
      {typeLabels[type]}
    </p>
  ) : (
    <div className="grid grid-cols-2 gap-2">
      {TYPE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => pickType(option.value)}
          className={cn(
            "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors",
            type === option.value
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
  <input type="hidden" name="type" value={type} />
</div>
```

(This step keeps the picker in its current DOM location, still inside `<form>` — Task 2 relocates it. The tile grid moves from 2 columns with descriptions (old template grid) merged with 3-column-no-description (old custom grid) into one 2-column grid with descriptions, since the tiles now need room for both the mechanic name and its description line.)

- [ ] **Step 7: Add the stamp quick-pick chips**

Inside the `type === "stamp"` block, find the `stamps_required` field:

```tsx
<div className="space-y-2">
  <Label htmlFor="stamps_required" className={labelClass}>
    Stamps required
  </Label>
  <Input
    id="stamps_required"
    name="stamps_required"
    type="number"
    required
    min={2}
    max={20}
    placeholder="10"
    value={stampsRequired}
    onChange={(e) => setStampsRequired(Number(e.target.value))}
    className="h-11 rounded-xl"
  />
</div>
```

Replace it with:

```tsx
<div className="space-y-2">
  <Label htmlFor="stamps_required" className={labelClass}>
    Stamps required
  </Label>
  <Input
    id="stamps_required"
    name="stamps_required"
    type="number"
    required
    min={2}
    max={20}
    placeholder="10"
    value={stampsRequired}
    onChange={(e) => setStampsRequired(Number(e.target.value))}
    className="h-11 rounded-xl"
  />
  <div className="flex gap-1.5">
    {[5, 10, 15].map((n) => (
      <button
        key={n}
        type="button"
        onClick={() => setStampsRequired(n)}
        className={cn(
          "h-7 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
          stampsRequired === n
            ? "border-primary bg-primary/10 text-primary"
            : "bg-card text-muted-foreground hover:bg-muted/50",
        )}
      >
        {n}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm vitest run src/app/setup/setup-form.dom.test.tsx`
Expected: PASS — all 6 tests (3 existing + 3 new).

- [ ] **Step 9: Confirm no dead references remain**

Run: `grep -rn "pickerMode\|selectedTemplateKey\|pickTemplate\|pickCustomType\|TEMPLATES\|@/lib/templates" src test`
Expected: no output.

- [ ] **Step 10: Run the full check, test suite, and build**

Run: `pnpm check && pnpm test && pnpm build`
Expected: all three clean/passing — no failures, no type errors, build succeeds.

- [ ] **Step 11: Commit**

```bash
git add src/app/setup/setup-form.tsx src/app/setup/setup-form.dom.test.tsx
git rm src/lib/templates.ts test/lib/templates.test.ts
git commit -m "feat: collapse /setup's type picker into one flat grid, blank-reset name/reward, add stamp quick-pick chips"
```

---

### Task 2: Restructure the layout into type-picker+preview | card-details columns

**Files:**

- Modify: `src/app/setup/setup-form.tsx`
- Modify: `src/app/setup/setup-form.dom.test.tsx`

**Interfaces:**

- Consumes: `type`, `pickType`, `TYPE_OPTIONS`, `typeLabels`, `name`, `rewardText`, `stampsRequired`, `visitsToBloom`, `winPercent`, `pityCeiling`, `periodDays`, `targetStreak`, `segments`, `headStart`, `carryOverStamps`, `showCarryOverOption`, `previewProgress`, `updateSegment`, `addSegment`, `removeSegment` — all from Task 1, unchanged names/types.
- Produces: no new exports — this task only changes `SetupForm`'s returned JSX structure.

**Key structural detail this task must get right:** the visible type-picker grid moves to the left column, _outside_ the `<form>` element — but the hidden `<input type="hidden" name="type" value={type} />` that carries the selected type into the submitted `FormData` must stay _inside_ `<form>` (in the right column), since a hidden input outside the `<form>` DOM subtree does not submit with it. Move that one hidden input to sit alongside the existing `id`/`replacing` hidden inputs at the top of `<form>`.

- [ ] **Step 1: Write the failing test**

Add these two tests to the `describe("SetupForm type picker", ...)` block in `src/app/setup/setup-form.dom.test.tsx` (after the existing 3 tests in that block, before its closing `});`):

```tsx
it("shows both section headings, type picker and preview in the left column", () => {
  render(
    <SetupForm
      program={null}
      isEdit={false}
      replacingId={null}
      replacingType={null}
    />,
  );
  expect(screen.getByText("Choose a card type")).toBeInTheDocument();
  expect(screen.getByText("Card details")).toBeInTheDocument();
});

it("edit mode shows the locked type label and preview together, no type grid", () => {
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
```

(The preview always simulates a fresh customer card — `stamp_count: 0` unless `headStart` is on — even in edit mode; it never reads the actual existing program's real customer data. With `head_start: false` on the mock program, the preview shows `0/10 stamps`, not the DB's own `stamps_required` value reflected as "already collected".)

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `pnpm vitest run src/app/setup/setup-form.dom.test.tsx`
Expected: the 2 new tests FAIL — "Choose a card type"/"Card details" headings don't exist yet in the pre-Task-2 layout.

- [ ] **Step 3: Restructure the returned JSX**

In `src/app/setup/setup-form.tsx`, the current return statement is:

```tsx
  return (
    <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
      <form action={formAction} className="space-y-5">
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
            <div className="grid grid-cols-2 gap-2">
              {TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => pickType(option.value)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors",
                    type === option.value
                      ? "border-primary bg-primary/10"
                      : "bg-card hover:bg-muted/50",
                  )}
                >
                  <span className="text-sm font-semibold">
                    {option.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          )}
          <input type="hidden" name="type" value={type} />
        </div>

        {type === "stamp" ? (
          /* ... unchanged stamp/plant/shared field blocks, reward, toggles, expiry, submit button ... */
        )}
      </form>
      <PreviewCard
        progress={previewProgress}
        name={name}
        rewardText={rewardText}
      />
    </div>
  );
```

Replace the whole return statement with:

```tsx
  return (
    <div className="mt-7 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:items-start">
      <div className="space-y-4">
        <h3 className={labelClass}>Choose a card type</h3>
        {isEdit ? (
          <p className="flex h-11 items-center rounded-xl border bg-muted/40 px-3 text-sm font-semibold text-muted-foreground">
            {typeLabels[type]}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => pickType(option.value)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors",
                  type === option.value
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
        <PreviewCard
          progress={previewProgress}
          name={name}
          rewardText={rewardText}
        />
      </div>

      <form action={formAction} className="space-y-5">
        {program ? <input type="hidden" name="id" value={program.id} /> : null}
        {replacingId ? (
          <input type="hidden" name="replacing" value={replacingId} />
        ) : null}
        <input type="hidden" name="type" value={type} />

        <h3 className={labelClass}>Card details</h3>

        {type === "stamp" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name" className={labelClass}>
                Card name
              </Label>
              <Input
                id="name"
                name="name"
                type="text"
                required
                maxLength={60}
                placeholder="Coffee card"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stamps_required" className={labelClass}>
                Stamps required
              </Label>
              <Input
                id="stamps_required"
                name="stamps_required"
                type="number"
                required
                min={2}
                max={20}
                placeholder="10"
                value={stampsRequired}
                onChange={(e) => setStampsRequired(Number(e.target.value))}
                className="h-11 rounded-xl"
              />
              <div className="flex gap-1.5">
                {[5, 10, 15].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setStampsRequired(n)}
                    className={cn(
                      "h-7 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                      stampsRequired === n
                        ? "border-primary bg-primary/10 text-primary"
                        : "bg-card text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : type === "plant" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name" className={labelClass}>
                Card name
              </Label>
              <Input
                id="name"
                name="name"
                type="text"
                required
                maxLength={60}
                placeholder="Grow-a-kopi"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="visits_to_bloom" className={labelClass}>
                Visits to bloom
              </Label>
              <Input
                id="visits_to_bloom"
                name="visits_to_bloom"
                type="number"
                required
                min={4}
                max={20}
                placeholder="6"
                value={visitsToBloom}
                onChange={(e) => setVisitsToBloom(Number(e.target.value))}
                className="h-11 rounded-xl"
              />
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="name" className={labelClass}>
                Card name
              </Label>
              <Input
                id="name"
                name="name"
                type="text"
                required
                maxLength={60}
                placeholder={
                  type === "lucky"
                    ? "Lucky topping"
                    : type === "wheel"
                      ? "Spin to win"
                      : type === "scratch"
                        ? "Scratch & win"
                        : "Weekly regular"
                }
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>

            {type === "streak" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="period_days" className={labelClass}>
                    Days per streak window
                  </Label>
                  <Input
                    id="period_days"
                    name="period_days"
                    type="number"
                    required
                    min={1}
                    max={30}
                    placeholder="7"
                    value={periodDays}
                    onChange={(e) => setPeriodDays(Number(e.target.value))}
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target_streak" className={labelClass}>
                    Streak length to earn reward
                  </Label>
                  <Input
                    id="target_streak"
                    name="target_streak"
                    type="number"
                    required
                    min={2}
                    max={20}
                    placeholder="4"
                    value={targetStreak}
                    onChange={(e) => setTargetStreak(Number(e.target.value))}
                    className="h-11 rounded-xl"
                  />
                </div>
              </div>
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
                            updateSegment(i, {
                              weight: Number(e.target.value),
                            })
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
                    value={pityCeiling ?? ""}
                    onChange={(e) =>
                      setPityCeiling(
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                      )
                    }
                    className="h-11 rounded-xl"
                  />
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="win_percent" className={labelClass}>
                    Win chance (%)
                  </Label>
                  <Input
                    id="win_percent"
                    name="win_percent"
                    type="number"
                    required
                    min={2}
                    max={100}
                    placeholder="20"
                    value={winPercent}
                    onChange={(e) => setWinPercent(Number(e.target.value))}
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pity_ceiling" className={labelClass}>
                    Guaranteed win by
                  </Label>
                  <Input
                    id="pity_ceiling"
                    name="pity_ceiling"
                    type="number"
                    required
                    min={2}
                    max={20}
                    placeholder="8"
                    value={pityCeiling ?? 8}
                    onChange={(e) => setPityCeiling(Number(e.target.value))}
                    className="h-11 rounded-xl"
                  />
                </div>
              </div>
            )}
          </>
        )}

        <div className="space-y-2">
          <Label htmlFor="reward_text" className={labelClass}>
            Reward
          </Label>
          <Input
            id="reward_text"
            name="reward_text"
            type="text"
            required
            maxLength={80}
            placeholder="Free kopi"
            value={rewardText}
            onChange={(e) => setRewardText(e.target.value)}
            className="h-11 rounded-xl"
          />
        </div>

        {(type === "stamp" || type === "plant" || type === "streak") && (
          <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
            <Switch
              id="head_start_checkbox"
              checked={headStart}
              onCheckedChange={setHeadStart}
              className="mt-0.5"
            />
            <label htmlFor="head_start_checkbox" className="text-sm">
              <span className="font-medium">
                Give new customers a head start
              </span>
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

        {showCarryOverOption && (
          <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
            <Switch
              id="carry_over_stamps_checkbox"
              checked={carryOverStamps}
              onCheckedChange={setCarryOverStamps}
              className="mt-0.5"
            />
            <label htmlFor="carry_over_stamps_checkbox" className="text-sm">
              <span className="font-medium">
                Carry over customers&apos; current stamp count onto the new card
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Left unchecked, everyone starts the new card from zero.
              </span>
            </label>
            <input
              type="hidden"
              name="carry_over_stamps"
              value={carryOverStamps ? "true" : "false"}
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
            their card is regenerated. Leave blank for a card that never
            expires.
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
          {isEdit
            ? "Save changes"
            : replacingId
              ? "Change type"
              : prepping
                ? "Save as draft"
                : "Create card"}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/app/setup/setup-form.dom.test.tsx`
Expected: PASS — all 8 tests (6 from Task 1 + 2 new).

- [ ] **Step 5: Run the full check, test suite, and build**

Run: `pnpm check && pnpm test && pnpm build`
Expected: all three clean/passing.

- [ ] **Step 6: Commit**

```bash
git add src/app/setup/setup-form.tsx src/app/setup/setup-form.dom.test.tsx
git commit -m "feat: restructure /setup into type-picker+preview | card-details columns"
```

## Self-Review Notes

- **Spec coverage:** Section A (delete templates) → Task 1 Step 3. Section B (flat grid + blank reset) → Task 1 Steps 4-6. Section C (quick-pick chips) → Task 1 Step 7. Section D (layout) → Task 2 Step 3. Out-of-scope items (two-tier stamps, configurable head-start) → deliberately absent from both tasks, called out in Global Constraints. All covered.
- **Placeholder scan:** none — every step shows complete code; the one comment-style elision (`/* ... unchanged stamp/plant/shared field blocks ... */`) appears only in Task 2 Step 3's "current state" reference block (showing what's being replaced FROM), never in a "write this" code block — the replacement code immediately after it is complete and unabridged.
- **Type consistency:** `pickType(value: ProgramType)` (Task 1) is called identically in Task 2's JSX (`onClick={() => pickType(option.value)}`); `TYPE_OPTIONS` (Task 1) is iterated identically in both tasks' picker JSX. No renames between tasks.
- **Ambiguity resolved:** the spec's Section B code sample didn't specify a grid column count for the unified picker; this plan picks `grid-cols-2` (matching the old template grid, since tiles now need two lines of text — label + description) over the old custom grid's `grid-cols-3` (label only, no room for description), and states this explicitly in Task 1 Step 6.
- **Structural risk called out:** Task 2 explicitly flags and resolves the hidden `type` input's required DOM position (must stay inside `<form>` even though the visible picker moves outside it) — this is exactly the kind of detail that's easy to silently break during a JSX reorganization.
