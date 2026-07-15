# Fill the Cup: Plant mechanic reskin

Date: 2026-07-15

## Problem

The current program type roster has one accumulation-with-decay mechanic
(Plant, "Sprout" — grow a plant that wilts if the customer stays away) and
one accumulation-without-decay mechanic reskinned twice (Stamp's dots, and
the just-shipped Flame Club). A cafe/beverage-themed vendor may want the
same "grows with visits, decays if neglected" mechanic presented as a cup
filling up rather than a plant growing — no new engine behavior, purely a
different visual skin, confirmed earlier in this session's brainstorm as
"a reskin of plant."

## Decision: reuse Plant's engine, add a variant-aware view instead of a new kind

Unlike Flame Club (which introduced a brand-new `ProgressView` kind
`"flame"`), Fill the Cup follows a tighter precedent already in this
codebase: `ChanceConfig`'s `variant: "wheel" | "scratch"` shares one
`"chance"` `ProgressView` kind, with the variant field telling the renderer
which visual to draw. Fill the Cup does the same for Plant's existing
`"plant"` kind.

- `PlantConfig` gains `variant?: "plant" | "cup"` (default `"plant"`).
- `plantStrategy.apply`/`redeem`/`decayedGrowth`/`stageIndexFor`/
  `bloomThreshold` are **entirely unchanged** — decay, floor-on-wilt, and
  bloom-threshold math is identical between Plant and Cup. Only the stage
  **name** lookup and the `ProgressView`'s `variant` field are new.
- `ProgressView`'s existing `"plant"` case gains `variant: "plant" | "cup"`
  — no new top-level view kind, no new switch-case anywhere that already
  handles `"plant"`.

## Decisions

- **Decay is kept, true reskin**: wilting/decay behaves identically to
  Plant — a cup "evaporates" toward the floor stage (Quarter Full, 25% of
  target) if the customer stays away past `grace_days`, same as Plant
  floors at Sprout (25%). No card regeneration on decay, matches today's
  Plant behavior exactly — same card/QR token, only the `growth` state
  value drifts down.
- **Stage names** (same 5 fixed thresholds as Plant — 0/25/50/75/100% of
  the target visit count, not vendor-configurable, matching Plant's own
  precedent):
  - **Empty** — 0%
  - **Sip** — 25%
  - **Quarter Full** — 50%
  - **Nearly Full** — 75%
  - **Full** — 100% (reward-ready)
- **Full-stage flourish**: the Cup's SVG draws a simple latte-art swirl on
  top of the liquid only at the Full stage — a nice-to-have visual
  parallel to Plant's Bloom stage showing flower petals, no engine
  involvement (pure presentational, driven by `stage >= totalStages - 1`,
  same condition `plant.tsx` already uses for its own bloom petals).
- **Naming**: vendor-facing type picker tile is "Fill the Cup" (matching
  the user's own phrasing throughout this feature's discussion).
- **Field reuse**: Fill the Cup reuses Plant's existing `visits_to_bloom`
  field name/id/range (2–20) verbatim — no new form field. Label copy
  becomes "Visits to fill" instead of "Visits to bloom" when the cup
  variant is selected.
- **Head-start**: already conditioned on `type === "plant"` for both the
  toggle and the percent input — no change needed, Cup gets it for free
  since `type` stays `"plant"`.

## A. `src/lib/engine/plant.ts` — variant-aware stage naming

- `PlantConfig` gains `variant?: "plant" | "cup"` (absent/`"plant"` =
  today's behavior, unchanged).
- `apply`/`redeem`/`decayedGrowth`/`stageIndexFor`/`bloomThreshold` are
  **unchanged** — zero behavior drift, only `progress()`'s returned
  `view` gains `variant: config.variant ?? "plant"`.
- Stage _names_ are no longer baked into `PlantConfig.stages` alone;
  `progress()` selects the display name from a variant-keyed name table
  (Plant's 5 names vs. Cup's 5 names) indexed by the same `stage` number
  `stageIndexFor` already computes — the underlying `stages[].threshold`
  array (used for the actual math) stays exactly as `buildPlantConfig`
  produces it today, unaffected by variant.

## B. `src/lib/engine/types.ts` — `ProgressView`'s `plant` case

- The existing `{ kind: "plant"; stage: number; stageName: string;
totalStages: number; wilting: boolean }` member gains one field:
  `variant: "plant" | "cup"`.

## C. New component: `src/components/cup.tsx`

- Mirrors `plant.tsx`'s structure exactly: same `{stage, totalStages,
wilting, className}` props, same `frac = stage / max(totalStages-1, 1)`
  fill-fraction math, same `wilting` dimming treatment (muted-foreground
  vs. primary color).
- Visual: a cup outline (SVG path), liquid fill rising from the base to
  `frac` of the cup's height, color/opacity dimmed when `wilting` (cup
  "evaporating" — a receding, paler liquid level rather than a wilting
  stem). At `stage >= totalStages - 1` (Full), draws a small latte-art
  swirl on the liquid surface, mirroring `plant.tsx`'s `isBloom` flower
  petals both structurally and visually (a subtle "reward-ready"
  flourish).

## D. Wiring into existing render sites

Same 3 call sites Plant already has a case in — `src/app/c/program-card-
status.tsx`, `src/app/dashboard/serve-customer.tsx` (confirmed: unlike
Stamp's text-only result panel, Plant's result panel genuinely renders
`<Plant>` around line 450 — this is a real 3rd render site for Cup, not
skippable like Flame Club's equivalent), and `src/app/setup/preview-
card.tsx`. Each site's existing
`view.kind === "plant"` branch adds one conditional: render `<Cup>` when
`view.variant === "cup"`, else `<Plant>` as today — no new top-level
branch, matching the `"chance"` kind's existing `view.variant === "wheel"
? <Wheel> : <ScratchCard>` pattern exactly.

## E. `src/lib/program-config.ts` / `src/lib/program.ts` — save-path wiring

- `buildPlantConfig` gains a `variant: "plant" | "cup"` parameter
  (threaded through from the save-path, defaulting to `"plant"`),
  selecting which stage-name table `plant.ts`'s `progress()` will later
  read from (see Section A — the name table lives in `plant.ts`, not
  `program-config.ts`, since it's a display concern of `progress()`, not
  a config-construction concern).
- `saveProgramSchema`'s plant variant gains an optional
  `variant: z.enum(["plant", "cup"]).optional()`.
- `buildProgramFields`'s plant branch's config-building call passes
  `variant: data.variant ?? "plant"` through to `buildPlantConfig`.
- No new column in `PROGRAM_COLUMNS` — `variant` lives entirely inside the
  existing `config` jsonb, same as Flame Club.

## F. `src/app/setup/setup-form.tsx` — Fill the Cup as an 8th tile

- `TYPE_OPTIONS`/`typeLabels` gains a `cup` entry ("Fill the Cup", "Fill a
  cup with every visit", cup icon).
- UI-only discriminator, not a new `type` value: `pickType` for the `cup`
  tile sets `type` state to `"plant"` and the `variant` state (already
  introduced by Flame Club's Task 4 for the stamp/flame split) to `"cup"`;
  the existing "Sprout" tile sets `variant` to `"plant"`. A hidden mirror
  input `name="variant"` submits alongside the existing
  `visits_to_bloom`/`reward_text` inputs, following the exact same
  conditional-rendering pattern Flame Club's percent input and hidden
  mirror already established.
- The `visits_to_bloom` field's `<Label>` text becomes conditional:
  `variant === "cup" ? "Visits to fill" : "Visits to bloom"`. Input
  id/name/range (2–20) unchanged and shared between both tiles.

## G. `src/app/setup/preview-state.ts` / `preview-animation.ts`

- `PreviewInput`'s existing plant-config construction passes `variant`
  through to `buildPlantConfig`, same pattern as Flame Club's stamp
  branch.
- No animation-timing changes needed — Plant's tick behavior (real
  `applyVisit`/decay-aware `getProgress` on the existing 3s loop) is
  completely unaffected by which visual variant is selected.

## Testing

- `test/lib/engine/plant.test.ts`: new cases for `progress()` with
  `variant: "cup"` — stage names read from the Cup table at each of the 5
  thresholds; `apply`/`redeem`/decay behavior confirmed unchanged (no
  variant branching in those functions, existing tests already cover
  them).
- New `test/components/cup.test.tsx` (or co-located `.dom.test.tsx`):
  renders correctly at each of the 5 stages, wilting dims correctly, latte
  art only appears at Full.
- `test/app/preview-state.test.ts`: plant branch gains a `variant: "cup"`
  case.
- `src/app/setup/setup-form.dom.test.tsx`: new Fill the Cup tile selection
  sets `type=plant` + `variant=cup` in submitted FormData, label reads
  "Visits to fill".
- `test/lib/save-program-schema.test.ts` / `build-program-fields.test.ts`:
  plant variant field accepted/defaulted.
- Full repo-wide grep after implementation to confirm the `"chance"`-kind
  pattern was followed consistently (no accidental new `ProgressView` kind
  introduced for cup).

## Out of scope

- Any database migration — not needed, same reasoning as Flame Club
  (`config` is jsonb, `type` stays `"plant"`).
- Any change to Plant's own default (`variant: "plant"`) behavior,
  decay/wilt thresholds, or the underlying stage threshold percentages
  (0/25/50/75/100%) — these stay exactly as Plant defines them today.
- Points accumulation (still queued separately, scope not yet clarified).
- The Streak Club mechanic redesign scope this session already resolved
  via Flame Club — no relation to this spec.
