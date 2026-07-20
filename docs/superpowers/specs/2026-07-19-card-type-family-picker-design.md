# Card Type Family Picker — Design Spec

## Problem

`/setup`'s type picker (`src/app/setup/setup-form.tsx`, `TYPE_OPTIONS`) shows
8 flat tiles: Stamp card, Flame Club, Points Club, Lucky Tap, Sprout, Fill the
Cup, Spin the Wheel, Scratch Card. Vendors read this as 8 unrelated card
types. In reality the backend already dedupes most of these:

- `type: "stamp"` + `variant: "dots" | "flame" | "points"` — one engine
  (`src/lib/engine/stamp.ts`).
- `type: "plant"` + `variant: "plant" | "cup"` — one engine
  (`src/lib/engine/plant.ts`).
- `type: "wheel"` and `type: "scratch"` — two DB type values, but both run
  through `makeChanceStrategy(variant)` (`src/lib/engine/chance.ts`), a
  single strategy factory. Not currently grouped in the UI.
- `type: "lucky"` — a genuinely distinct state machine
  (`visits_since_win`/`cooldown_visits`/`pity_ceiling`/probability roll,
  `src/lib/engine/lucky.ts`). Confirmed not foldable into stamp or chance
  without new engine design — out of scope here, stays standalone.

The fix is UI-only: group the picker into families, with a second step for
picking a style within a family. No DB schema, migration, or engine change —
every family/style combination already maps to an existing `type`+`variant`
pair that `buildProgramFields` (`src/lib/program.ts`) and the engine already
handle.

## Families

| Family | Top-level label | Styles (label → type/variant)                                                            |
| ------ | --------------- | ---------------------------------------------------------------------------------------- |
| Stamp  | "Stamp Card"    | Classic → `stamp`/`dots` · Flame Club → `stamp`/`flame` · Points Club → `stamp`/`points` |
| Sprout | "Sprout"        | Classic → `plant`/`plant` · Fill the Cup → `plant`/`cup`                                 |
| Chance | "Chance Card"   | Spin the Wheel → `wheel` (no variant) · Scratch Card → `scratch` (no variant)            |
| Lucky  | "Lucky Tap"     | single style, no sub-step → `lucky` (no variant)                                         |

These are exactly today's 8 leaf options, regrouped. No new type/variant
value is introduced; "Chance Card" is a new **UI-only** grouping label over
the existing `wheel`/`scratch` DB values.

## Interaction

**Step 1 — family grid.** Same tile grid style as today's `TYPE_OPTIONS`
grid, but 4 tiles (Stamp Card, Sprout, Chance Card, Lucky Tap) instead of 8.
Each multi-style family tile shows its description plus a small style count
hint (e.g. "3 styles"); Lucky Tap keeps its current single description.

**Step 2 — style grid (multi-style families only).** Clicking a multi-style
family swaps the grid for that family's style tiles (2-3 tiles) and shows a
"← Back" link above them that returns to the family grid without resetting
any already-typed name/reward text... except picking a style itself still
resets name/reward/defaults, exactly as `pickType()` does today — that
behavior is unchanged, only reachable via one extra click.

Clicking **Lucky Tap** in Step 1 behaves exactly like clicking any leaf
option today — no Step 2, selection completes immediately.

**Re-entering the picker.** If the vendor has already picked a style and
clicks "← Back" then re-picks the _same_ family, the picker should re-open
directly on that family's Step 2 (not force them back through Step 1) —
implemented as component state (`familyStep: "family" | FamilyKey`)
initialized from the current `type`/`variant` on mount, exactly like `type`
and `variant` state are today.

**Prep/migrate flows.** Both already render the full picker (`isEdit` is
`false` for prep, and migrate always starts from no prior type) — no special
casing beyond what exists.

**Edit flow.** Unchanged. `isEdit` still shows the locked type label
(`typeLabels[selectedOptionKey]`), never the picker grid — type changes only
happen via the separate migrate flow.

## Data mapping

`pickType()` already contains the flame/points/cup → type+variant mapping
logic. This becomes a two-level lookup:

```ts
const FAMILIES = {
  stamp: {
    label: "Stamp Card",
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
  plant: {
    label: "Sprout",
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
  chance: {
    label: "Chance Card",
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
  lucky: {
    label: "Lucky Tap",
    description: "A chance to win on every visit",
    single: true,
  },
} as const;
```

`chance` is a UI-only family key — selecting a style inside it sets
`type` to the style's own key (`"wheel"` or `"scratch"`), same as today.
Selecting a style inside `stamp` sets `type: "stamp"` and `variant` to the
style key; same for `plant`. This is a direct refactor of the existing
`pickType()` switch, not new mapping logic.

## Testing

- `setup-form.dom.test.tsx`: replace the existing "flat 8-tile grid" cases
  with: (1) Step 1 renders 4 family tiles; (2) clicking a multi-style family
  shows its styles + Back link; (3) clicking Back returns to Step 1; (4)
  picking a style submits the correct `type`/`variant` (one case per
  existing leaf, migrated from the current flat-picker tests); (5) clicking
  Lucky Tap submits `type=lucky` with no Step 2 shown; (6) re-opening the
  picker via Back after a style is already selected lands on that family's
  Step 2, not Step 1.
- No changes needed to `setup-view.ts`/`setup-view.test.ts`,
  `preview-*.ts(x)`, `program.ts`, or any engine file — this spec touches
  only the type-picker UI inside `setup-form.tsx`.

## Out of scope

- Folding Lucky Tap into Stamp/Chance (needs new engine design — deferred).
- Any Wheel/Scratch/Points "revamp" beyond this regrouping (user has not
  yet specified what's wrong with them beyond this UI complaint — deferred,
  to be scoped separately if still needed after this ships).
- Any DB/schema/migration change — zero `type`/`variant` values change.
