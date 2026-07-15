# Vendor-configurable head-start percentage

Date: 2026-07-15

## Problem

`head_start` is a boolean-only toggle today, with a fixed seed formula
baked into `enroll_card` (`supabase/migrations/0014_loopkit_head_start.sql`):
stamp/plant always seed ~20% of the way to the reward. Vendors have no
control over how much of a head start they're giving away.

## Investigation

- `programs.head_start boolean` is the only relevant column today.
- `enroll_card` (SECURITY DEFINER Postgres function) seeds real customer
  cards: stamp `v_seed = greatest(1, round(stamps_required * 0.2))`, capped
  below completion; plant floors that seed at the Sprout stage threshold
  (`round(stamps_required * 0.25)`), also capped below bloom; streak always
  seeds exactly one full banked period (`current_streak: 1`) — not a
  percentage, there's no fractional-period representation in the engine.
- `src/app/setup/preview-state.ts`'s `headStartStampSeed`/
  `headStartPlantGrowth` are a hand-maintained TypeScript port of the same
  formula, used by both the static preview (`buildPreviewProgress`) and the
  live animation (`buildInitialCard`, consumed by `usePreviewAnimation`).
- The full field-flow for `head_start` today: `setup-form.tsx`'s toggle →
  hidden mirror input → `actions.ts`'s 3 action functions
  (`saveProgramAction`/`changeTypeAction`/`prepProgramAction`) →
  `saveProgramSchema` (per-type discriminated union, stamp/plant/streak
  variants only) → `buildProgramFields` → either a direct `.update()` (edit
  flow) or `create_program`'s `p_head_start` RPC param (create flow).
- Only stamp/plant/streak ever show the toggle (lucky/wheel/scratch have no
  accumulating goal to seed) — unchanged by this spec.

## Decisions

- **Unit**: a percentage (5–50, default 20), not a raw count — generalizes
  the existing formula directly with one config knob shared across stamp
  and plant, rather than a type-specific count with its own validation
  range per type.
- **Streak is unaffected**: the toggle keeps today's exact behavior (always
  seeds one full banked period). The percentage field is not shown for
  streak and has no effect on it. This is forward-compatible with a future
  streak-mechanic redesign (queued separately) — if streak ever becomes
  visit-accumulation-based like plant, it would pick up the same
  configurable percentage automatically, no rework needed here.
- **Plant's Sprout-stage floor stays fixed at 25%, independent of the
  configurable percentage.** The floor exists because a seed that still
  renders as "Seed" (unstarted) defeats the entire point of head start —
  that reasoning holds at any percentage below 25%, not just the old fixed
  20%. A vendor setting 10% still gets floored to Sprout (25%) for plant
  cards specifically; stamp has no equivalent floor (any positive dot count
  visibly reads as progress).
- **Schema**: new additive column `programs.head_start_percent integer not
null default 20` — matches this codebase's established
  purely-additive-migration convention. Existing `head_start=true` programs
  get `head_start_percent=20`, reproducing today's behavior exactly with no
  retroactive change.
- **UI**: a number input (range 5–50) appears next to the head-start
  toggle, only for stamp/plant, defaulting to 20.

## A. Migration `0024_loopkit_head_start_percent.sql`

- `alter table loopkit.programs add column head_start_percent integer not
null default 20 check (head_start_percent between 5 and 50);`
- Recreate `create_program` with an additive trailing `p_head_start_percent
int default 20` param (matches the existing pattern for prior additive
  params like `p_expiry_days`/`p_active`), inserting it into the new
  column.
- Recreate `enroll_card`: stamp's `v_seed` computation changes from
  `round(v_program.stamps_required * 0.2)` to `round(v_program.stamps_required
  - v_program.head_start_percent / 100.0)`. Plant's floor computation
(`round(v_program.stamps_required * 0.25)`) is unchanged — stays a fixed
literal, per the Decisions section. Streak's branch is unchanged entirely
(still the literal one-period seed, doesn't read `head_start_percent` at
    all).

## B. `src/lib/program.ts`

- `saveProgramSchema`'s stamp and plant variants each gain an optional
  `head_start_percent: z.preprocess(emptyToUndefined, z.coerce.number().int().min(5).max(50).optional())`
  — optional because the UI only renders/submits the field when the
  head-start toggle is checked; absent means "use the default."
- `buildProgramFields`'s return type gains `headStartPercent: number`.
  Stamp/plant branches: `data.head_start_percent ?? 20`. Every other
  branch (lucky/wheel/scratch/streak): `20` (unused when `headStart` is
  `false`/irrelevant for streak, but the column is `NOT NULL` so every
  insert/update needs a value — 20 keeps it a harmless constant rather than
  a conditional).

## C. `src/app/setup/actions.ts`

- All 3 action functions read `formData.get("head_start_percent")` into
  their `saveProgramSchema.safeParse(...)` call alongside the existing
  `head_start` field.
- `saveProgramAction`'s edit-mode `.update()` call gains `head_start_percent:
headStartPercent`. Both create-flow `create_program` RPC calls
  (`saveProgramAction`, `changeTypeAction`) and `prepProgramAction`'s RPC
  call gain `p_head_start_percent: headStartPercent`.

## D. `src/app/setup/setup-form.tsx`

- New controlled state `const [headStartPercent, setHeadStartPercent] =
useState(program?.head_start_percent ?? 20);`.
- Inside the existing head-start toggle block, when `type === "stamp" ||
type === "plant"` (a narrower condition than the toggle's own
  `stamp/plant/streak`), render a number input (min 5, max 50, step 1)
  bound to `headStartPercent`, plus its own hidden mirror input
  `name="head_start_percent"` for form submission (only rendered — and
  thus only present in `FormData` — when this narrower condition holds,
  matching the schema's "absent means default" handling).
- `pickType`/`pickCustomType`-equivalent (`pickType`) resets
  `headStartPercent` to `20` on every type change, matching how every
  other numeric field already resets.

## E. `src/app/setup/preview-state.ts`

- `PreviewInput` gains `headStartPercent: number`.
- `headStartStampSeed(stampsRequired, percent)` and
  `headStartPlantGrowth(visitsToBloom, percent)` take the percent as a
  parameter instead of the hardcoded `0.2`, computing
  `stampsRequired * percent / 100` (stamp) — plant's Sprout floor
  (`round(visitsToBloom * 0.25)`) stays hardcoded, matching the Postgres
  side exactly.
- `buildInitialCard` passes `input.headStartPercent` through to both
  helper calls.
- `usePreviewAnimation` (`src/app/setup/preview-animation.ts`) needs no
  changes beyond `PreviewInput` gaining the field — it already threads the
  whole `PreviewInput` through to `buildInitialCard`/`buildPreviewProgram`,
  and `recipeKey` already includes every `PreviewInput` field, so a percent
  edit already triggers a loop reset for free.

## Testing

- `test/db/*-schema.test.ts` precedent: a new schema test confirming
  `head_start_percent`'s column default (20) and check constraint (5–50).
- `test/lib/save-program-schema.test.ts` (or wherever
  `saveProgramSchema` is currently tested): stamp/plant accept an optional
  `head_start_percent` in range, reject out-of-range values; other types
  don't require it.
- `test/lib/build-program-fields.test.ts`: `headStartPercent` defaults to
  20 when absent, passes through when present, other types get 20
  unconditionally.
- `test/app/preview-state.test.ts`: `headStartStampSeed`/
  `headStartPlantGrowth` produce correct results at a non-default percent
  (e.g. 30%), plant's Sprout floor still applies at a low percent (e.g.
  10% still floors to 25%).
- `src/app/setup/setup-form.dom.test.tsx`: the percent input only renders
  for stamp/plant, submits correctly, resets to 20 on type change.

## Out of scope

- Any change to streak's mechanic or its head-start behavior — queued
  separately as its own future spec (potential mechanic redesign raised
  during this brainstorm).
- New program types (points accumulation, "fill the cup" — confirmed to be
  a plant-mechanic visual reskin, not a new mechanic) — queued after the
  streak redesign.
- Any change to the plant Sprout-floor's own threshold (25%) — stays fixed,
  not vendor-configurable, per the Decisions section.
