# /setup page redesign: flat type picker, blank vendor-entered content, restructured layout

Date: 2026-07-15

## Problem

`/setup`'s create-a-program form has grown confusing:

- A two-mode type picker (curated "template" grid vs. a "Custom — start from
  scratch" fallback grid) where the templates are named after example
  businesses ("Cafe Regulars", "Bakery Loaf Club", "Salon VIP") — three of
  which are the exact same mechanic (`stamp`), differing only in
  `name`/`stamps_required`/`reward_text`.
- Picking a template silently fills in `name` and `reward_text` with
  business-flavored copy ("Coffee card", "Free coffee") that isn't the
  vendor's own card — vendors want to type their own name and reward,
  always.
- The live preview (shipped 2026-07-14/15) sits beside the form in a plain
  two-column layout; the user wants the type picker visually separated from
  the rest of the form, with the preview appearing directly under the
  picker as soon as a type is chosen, above the detail fields.
- General readability ask: the page reads as one long undifferentiated
  form.

## Decisions

- **Delete the template system.** `src/lib/templates.ts` and
  `test/lib/templates.test.ts` are removed entirely. Confirmed via
  repo-wide grep: nothing outside `setup-form.tsx`,
  `templates.ts` itself, and its own test imports `TEMPLATES` — safe to
  delete outright, no dead references left behind.
- **One flat grid, six tiles.** The type picker becomes the single grid
  that today's "custom" mode already renders — Stamp card, Sprout, Lucky
  Tap, Spin the Wheel, Scratch Card, Streak Club — with no
  template-vs-custom toggle. Picking a tile sets `type` plus the same
  sensible numeric defaults `pickCustomType` already uses today
  (`stampsRequired=10`, `winPercent=20`/`pityCeiling=8`,
  `visitsToBloom=6`, `periodDays=7`/`targetStreak=4`; wheel/scratch keep
  `pityCeiling=undefined` and the existing `DEFAULT_SEGMENTS`).
- **`name` and `rewardText` always reset to blank on a type pick** — no
  suggested/prefilled copy, ever, on the create flow. The vendor types
  both themselves. This does not apply to edit/migrate flows: those still
  prefill from the actual existing program's real name/reward (the
  vendor's own prior data, not a template guess) — unchanged from today.
- **Stamp count quick-pick.** For the Stamp card type only, three chip
  buttons (5 / 10 / 15) sit next to the `stamps_required` number input;
  clicking one sets the input's value. The field stays freely editable
  either way — chips are a shortcut, not a constraint.
- **Layout**: the page splits into two labeled sections — "Choose a card
  type" (the grid) and "Card details" (name, mechanic-specific fields,
  reward, head-start/carry-over toggles, expiry, submit). At `sm` width
  and up: two columns, left column holds the type grid with the live
  preview stacked directly beneath it, right column holds the card-details
  form. Below `sm`: fully stacked single column, order = grid → preview →
  form. In edit mode (type locked, no grid), the left column shows the
  locked type label in place of the grid, preview unchanged beneath it.
- **Out of scope, deferred to their own future specs** (raised during this
  brainstorm, deliberately not bundled in — both need engine/DB changes,
  not just page changes):
  - **Two-tier stamp rewards**: a stamp card with two reward thresholds
    (e.g. 5 stamps = small reward, 10 stamps = bigger reward). Today's
    `StampConfig` (`src/lib/engine/stamp.ts`) is single
    threshold/reward-text only — this needs a new config shape, a new (or
    extended) engine strategy, a DB migration, and new customer-facing
    card UI to show two tiers on one card.
  - **Vendor-configurable head-start amount**: today `head_start` is a
    boolean toggle with a fixed ~20% seed formula in `enroll_card`
    (`supabase/migrations/0014_loopkit_head_start.sql`) — not
    vendor-adjustable. Making the amount configurable needs a new numeric
    column, a migration, and an `enroll_card`/preview-state formula
    change, not just a UI control.

## A. `src/lib/templates.ts` and its test — delete

Removed outright. `TEMPLATES`, `Template` type, and the curated-business
presets go away with it.

## B. `SetupForm` — type picker

Replace the current `pickerMode`/`selectedTemplateKey`/`TEMPLATES`-driven
two-mode picker with a single grid, structurally identical to today's
"custom" grid (`src/app/setup/setup-form.tsx` lines ~232-259 in the
pre-redesign file), but always rendered (no mode switch):

```tsx
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

(Descriptions are new — short mechanic summaries, replacing the deleted
templates' business-scenario blurbs, since the grid no longer carries any
other explanatory copy.)

`pickType(value: ProgramType)` replaces both `pickTemplate` and
`pickCustomType` with one function: sets `type`, resets `name`/`rewardText`
to `""`, and sets the same per-type numeric defaults `pickCustomType`
already sets today (unchanged values, just no longer conditional on a
template pick vs. a raw type pick — there's only one path now).

`selectedTemplateKey` state is removed; tile highlighting keys off `type`
directly (`type === option.value`), same pattern the old "custom" grid
already used.

## C. `SetupForm` — stamp count quick-pick chips

Inside the `type === "stamp"` field block, next to the `stamps_required`
Input, add three small buttons:

```tsx
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
```

Purely a convenience `setStampsRequired` call — no new state, no schema
change (`stamps_required` already accepts any 2-20 value).

## D. `SetupForm` — layout restructure

The returned JSX reorganizes from the current single `grid-cols-2`
(form | preview) into a nested structure:

```tsx
return (
  <div className="mt-7 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:items-start">
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Choose a card type
      </h3>
      {/* type grid, or the locked-type label in edit mode */}
      <PreviewCard
        progress={previewProgress}
        name={name}
        rewardText={rewardText}
      />
    </div>
    <form action={formAction} className="space-y-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Card details
      </h3>
      {/* name/type-specific fields/reward/toggles/expiry/submit — unchanged content, moved out of the type-picker block */}
    </form>
  </div>
);
```

The breakpoint moves from `lg` to `sm` (tablet, not just desktop) per the
approved layout — matches the "tablet width: two columns" requirement.
Below `sm`: the grid's natural single-column stacking already produces
picker → preview → form in DOM order, no extra CSS needed.

## Testing

- `src/app/setup/setup-form.dom.test.tsx` (existing, from the live-preview
  feature) is updated: tests that referenced template-picking behavior are
  removed/rewritten against the flat grid; the existing live-preview and
  submission tests are adjusted for the new blank-by-default name/reward
  behavior (no more asserting a template-provided default value survives
  into `previewProgress` or the submitted `FormData`).
- New test coverage: picking a type tile resets `name`/`rewardText` to
  blank even if they had prior text typed in; the stamp quick-pick chips
  set `stampsRequired` and the preview label updates accordingly; edit
  mode still shows the locked type label + preview in the left column.
- `test/lib/templates.test.ts` is deleted along with `templates.ts`.

## Out of scope

- Two-tier stamp rewards and vendor-configurable head-start amount — see
  Decisions above; each gets its own future spec.
- Any change to `saveProgramSchema`, `buildProgramFields`, or any
  server-side validation — this redesign only changes what the form
  starts pre-filled with and how it's laid out, not what's accepted on
  submit.
- Any change to the `/c` customer-facing page or `program-card-status.tsx`
  — `PreviewCard` already mirrors it; this redesign doesn't touch either.
