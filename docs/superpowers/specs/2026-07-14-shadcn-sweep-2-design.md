# shadcn sweep round 2: Select + Switch across setup/qkit forms

Date: 2026-07-14

## Problem

Follow-up to the previous shadcn Select/Avatar conversion. That feature's
final review flagged two remaining native `<select>`s as explicitly out of
scope: `src/app/setup/schedule-retirement-form.tsx` and
`src/app/dashboard/qkit-earn-settings.tsx`. User asked for a fresh sweep
and fix.

A broader sweep (grep for `<select`, `<textarea`, checkbox/radio/toggle
patterns, hand-rolled dialogs, tabs, tooltips, progress bars across
`src/`) found three real hand-rolled spots with clean shadcn equivalents,
and nothing else — no textareas, no radio groups, no un-wrapped dialogs
(the existing `AlertDialog` is already used correctly where dialogs
exist), no tabs/tooltips/progress bars anywhere in the codebase. Two
`fixed inset-0` overlays exist (`scan-button.tsx`'s camera viewfinder,
`confetti-burst.tsx`'s decorative particle layer) but aren't dialogs and
are out of scope.

The three findings:

1. `schedule-retirement-form.tsx` — native `<select>` (successor-program
   picker, uncontrolled, submitted via `useActionState`/FormData).
2. `qkit-earn-settings.tsx` — native `<select>` (program picker, same
   uncontrolled/FormData pattern) **and** a native
   `<input type="checkbox">` styled as a plain on/off setting toggle
   ("Earn from qkit orders").
3. `setup-form.tsx` — two native `<input type="checkbox">` on/off setting
   toggles ("head start" and "carry over stamps"), both React-state
   controlled with a parallel hidden `"true"/"false"` string input each
   (because an unchecked native checkbox submits nothing at all — the
   hidden input guarantees the field is always present as an explicit
   string, which `src/app/setup/actions.ts` reads via literal
   `formData.get("carry_over_stamps") === "true"` comparisons).

## Decisions

- The two selects convert to shadcn's already-installed `Select`
  (installed in the prior feature — `src/components/ui/select.tsx`
  exists). No new install needed for these.
- The three checkboxes are all binary on/off _settings_, not
  list-selection items — shadcn `Switch` is the semantic fit (confirmed
  with the user directly; also matches qkit's own pattern for analogous
  settings, which uses a toggle pill rather than a checkbox). `Switch` is
  not yet installed — `pnpm dlx shadcn@latest add switch` is needed.
- **Zero server-action changes required**, in both directions:
  - Radix `Select`'s `name` prop (already used correctly in
    `ProgramSwitcher`'s underlying primitive) renders a hidden native
    `<select>` that bubbles into the surrounding `<form>`'s `FormData`
    exactly like a real `<select>` would — `schedule-retirement-form.tsx`
    and `qkit-earn-settings.tsx` both already read their program id via
    plain `formData.get(...)`, so no action code needs to change.
  - Radix `Switch`'s default form-bubble value when checked is the
    literal string `"on"` — identical to what an unlabeled native
    `<input type="checkbox">` already submits, which is exactly what
    `saveQkitEarnConfigAction` already checks
    (`formData.get("enabled") === "on"`). No action change needed there
    either.
  - `setup-form.tsx`'s two toggles keep their existing controlled-state +
    hidden-`"true"/"false"`-input pattern unchanged — only the _visible_
    checkbox markup becomes `Switch` (wired via `checked`/
    `onCheckedChange` instead of `checked`/`onChange`), the hidden mirror
    input stays exactly as-is since `actions.ts`'s literal string
    comparison is unrelated to this UI swap.

## A. `schedule-retirement-form.tsx`

Replace the native `<select id="successor_id" name="successor_id" required>`
block with:

```tsx
<Select name="successor_id" required defaultValue={successors[0]?.id}>
  <SelectTrigger id="successor_id" className="h-11 w-full rounded-xl">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {successors.map((s) => (
      <SelectItem key={s.id} value={s.id}>
        {s.name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

`defaultValue={successors[0]?.id}` preserves today's behavior (a plain
`<select>` with no placeholder auto-selects its first `<option>`).

## B. `qkit-earn-settings.tsx`

Select — replace the native `<select name="program_id">` block:

```tsx
<Select name="program_id" defaultValue={current?.programId || undefined}>
  <SelectTrigger className="w-full">
    <SelectValue placeholder="Choose a program" />
  </SelectTrigger>
  <SelectContent>
    {programs.map((p) => (
      <SelectItem key={p.id} value={p.id}>
        {p.name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

Switch — replace the `<label><input type="checkbox" .../> Earn from qkit
orders</label>` block:

```tsx
<div className="flex items-center gap-2">
  <Switch
    id="qkit-earn-enabled"
    name="enabled"
    defaultChecked={current?.enabled ?? false}
    aria-label="Earn from qkit orders"
  />
  <Label htmlFor="qkit-earn-enabled" className="text-sm">
    Earn from qkit orders
  </Label>
</div>
```

(`Label` from `@/components/ui/label`, already installed and already used
elsewhere in this app — replaces the plain-text `<label>` wrapper for
consistency with the rest of the codebase's form patterns.)

## C. `setup-form.tsx`

Both toggle blocks keep their surrounding `<div>` structure and hidden
mirror input unchanged; only the checkbox becomes a `Switch`. Head-start
block:

```tsx
<Switch
  id="head_start_checkbox"
  checked={headStart}
  onCheckedChange={setHeadStart}
  className="mt-0.5"
/>
<label htmlFor="head_start_checkbox" className="text-sm">
  <span className="font-medium">Give new customers a head start</span>
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
```

Carry-over block, identical shape with `carryOverStamps`/
`setCarryOverStamps`/`carry_over_stamps_checkbox`/`carry_over_stamps`
substituted throughout. Both blocks' existing `<label>` text content
(including the nested `<span>`s) is untouched — only the `<input
type="checkbox">` element itself is replaced by `<Switch>`.

## Testing

- `schedule-retirement-form.dom.test.tsx` (exists) — update any assertion
  that queries the native `<select>` by role/tag to instead query the new
  `SelectTrigger`/`SelectItem` structure, following the same
  userEvent-driven pattern established in the prior feature's
  `program-switcher.dom.test.tsx` rewrite (click trigger, click item).
  Same Radix jsdom polyfills (`hasPointerCapture`, `scrollIntoView`)
  already exist globally in `test/setup.ts` from that feature — no new
  polyfills needed for `Select`. `Switch` may need its own polyfill
  check — verify empirically during implementation; Radix `Switch` is
  generally jsdom-friendly (no positioning/portal logic), so likely none
  needed, but confirm rather than assume.
- `qkit-earn-settings.dom.test.tsx` (exists) — same Select-query-pattern
  update, plus update the checkbox-role assertions
  (`getByRole("checkbox", ...)`) to `getByRole("switch", ...)` (Radix
  `Switch` exposes an ARIA `switch` role, not `checkbox`).
- `setup-form.tsx` has no existing dedicated test file (confirmed, no
  page/component-level test precedent for this form in this repo) — no
  new test required, matching the prior feature's own precedent for this
  same file.

## Out of scope

- Any other UI element beyond these three files — the sweep found
  nothing else with a clean shadcn match.
- Any change to `src/app/setup/actions.ts` or
  `src/app/dashboard/actions.ts` — both already accept the exact values
  the new components will bubble.
- Any visual redesign beyond the component swap itself.
