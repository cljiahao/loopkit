# App-wide UI-UX Consistency Pass — Design Spec

## Problem

The July 19 UI-UX pass (PR #14) introduced `ElevatedCard`/`Section` and reskinned
dashboard-home, `/setup`, and `/dashboard/profile`. Every other page in the app
still hand-rolls the pre-#14 `rounded-2xl border bg-card p-5 shadow-sm` card
pattern: `/dashboard/{counter,plan,settings,customers,stats,activity}`,
`/admin/{,programs,vendors}`, and `login`/`reset-password`. This is a visual
inconsistency, not a functional bug — a page-by-page audit for mobile/tablet
breakage (grids, breakpoints, touch targets, table overflow) found the app
already handles responsive layout correctly everywhere except one page.

The one genuine functional gap: `/earn` (`src/app/earn/earn-form.tsx`) hand-rolls
raw `<input>`/`<button>` with no shadcn components — no `h-11` touch-target
sizing, no focus ring, `text-red-600` instead of the `text-destructive` token.
This is the one page in the app a customer fills in on their phone right after
a purchase, and it's the worst-built form in the codebase.

A secondary question raised during scoping — should the customer-facing card
view (`/c`, `/earn`) require login instead of today's link/QR-based no-auth
access — was resolved by research (see Decisions) before this spec was
written: no change, stay no-auth.

## Decisions

- **Scope: every remaining surface, one pass.** Dashboard sub-pages, admin
  console, and auth pages all move to `ElevatedCard`/`Section` in this design/PR,
  since the primitives already exist and the change is mechanical
  (wrapper-swap, not new layout logic) — confirmed with user over
  fix-vendor-dashboard-first or audit-only alternatives.
- **No customer-auth flow.** Researched via the `deep-research` skill
  (2026-07-20): every comparable stamp-card/loyalty product in this category
  (Loopy Loyalty, Badge, Stampet, Apple/Google Wallet passes) uses no-auth,
  link/QR/wallet-pass-based card access — not an outlier choice. Forcing
  login on a low-value repeat-visit action is conversion-negative (Baymard:
  19% of e-commerce cart abandonment ties to forced account creation — a
  general-checkout analogy, not loyalty-specific, but directionally strong)
  and adds no real security value here since the vendor's QR scan is already
  the authorization boundary for the stamping transaction itself. loopkit's
  `login`/`reset-password` pages stay vendor-only, unchanged in structure —
  this pass only reskins their wrapper to `ElevatedCard`.
- **Bearer-link risk — checked, no action needed.** The research flagged
  tokenized bearer links (a link alone treated as sufficient authorization)
  as the general risk class for no-auth card access. Checked loopkit's two
  customer-facing tokens: `/c?v=` is the vendor's own id, intentionally
  public (the RPC it calls, `vendor_active_programs`, is `SECURITY DEFINER`
  and designed to be public per its existing code comment) — not a
  per-customer secret. `/earn?order=` is a UUID from the `qkit_earn_config`
  integration's order table — already high-entropy. Neither needs a token
  redesign; this line of investigation is closed, not carried into
  implementation.
- **`/earn` gets a real rebuild, not a reskin.** Match `/c`'s existing pattern
  (shadcn `Input`/`Button`/`Label`, `h-11` sizing, `text-destructive`) rather
  than introducing a third form pattern.
- **Admin tables keep `overflow-x-auto` + `min-w-[...]`.** This is already the
  correct mobile-safe pattern for a desktop-first internal tool (horizontal
  scroll on a dense data table, not a stacked-card mobile rebuild) — only the
  page wrapper cards move to `ElevatedCard`.
- **One real mobile-breakpoint fix**: `activity-filters.tsx`'s Type/From/To
  fields are fixed `w-36`/`w-40` inside a `flex-wrap` row, which wraps
  awkwardly on narrow phones instead of stacking cleanly. Change to
  `w-full sm:w-36` (etc.) so each field goes full-width below `sm`.

## Areas

### A. Dashboard sub-pages (reskin only)

Files: `src/app/dashboard/counter/page.tsx`, `plan/page.tsx`,
`settings/page.tsx`, `customers/page.tsx`, `stats/page.tsx`,
`activity/page.tsx`, `activity/activity-table.tsx`,
`activity/activity-filters.tsx`.

- Replace every `rounded-2xl border bg-card p-5/p-6 shadow-sm` (and the
  `plan` page's `rounded-xl border bg-card px-5 py-4` variant) wrapper with
  `ElevatedCard`. Where a heading + icon + description precede the card body
  (matching the `Section` API's shape), use `Section` instead of a bare
  `ElevatedCard` — otherwise keep `ElevatedCard` alone (e.g. `Tile` in
  `stats/page.tsx`, list items in `customers`/`activity`, which are dense
  repeated rows, not header+body sections).
- `activity-filters.tsx`: apply the `w-full sm:w-36` mobile-stacking fix
  described above, no other change.
- No copy, grid-column, or data-fetching changes anywhere in this area —
  existing DOM tests that assert on rendered text/roles should keep passing;
  any test asserting on now-removed class names needs updating (flag in the
  implementation plan).

### B. Admin console (reskin only)

Files: `src/app/admin/page.tsx`, `admin/programs/page.tsx`,
`admin/vendors/page.tsx`.

- Wrapper cards (`rounded-2xl border bg-card p-6/px-4 shadow-sm`,
  `divide-y overflow-hidden rounded-2xl border bg-card shadow-sm`) →
  `ElevatedCard`.
- Table wrappers (`overflow-x-auto rounded-2xl border bg-card shadow-sm`
  around a `<table>`) also become `ElevatedCard` as the outer container, but
  the `overflow-x-auto` + `min-w-[640px]`/`min-w-[720px]` scroll behavior on
  the `<table>` itself is unchanged — this is the correct mobile pattern for
  a dense data table and is out of scope to redesign.
- `Stat` tile component (`src/app/admin/stat.tsx`) → `ElevatedCard`, same
  treatment as the dashboard `Tile`.

### C. Auth (reskin only)

Files: `src/features/auth/components/login-form.tsx`,
`reset-password-form.tsx`.

- Both files already hand-build the same visual shape `ElevatedCard`
  produces (`rounded-2xl border bg-card px-7 py-9 shadow-sm` /
  `rounded-2xl border bg-card shadow-sm`) — swap the wrapper `div` for
  `ElevatedCard`. No structural, layout, or copy change; already correctly
  responsive (`max-w-md`, `h-11`/`h-12` touch targets, shadcn `Input`).

### D. `/earn` rebuild

File: `src/app/earn/earn-form.tsx`.

- Replace raw `<input>`/`<button>` with shadcn `Input`/`Button`/`Label`,
  matching `/c`'s (`src/app/c/page.tsx`, `CheckForm`) established pattern:
  `h-11 rounded-xl` inputs, `Label` with the
  `text-xs font-semibold uppercase tracking-wider text-muted-foreground`
  style used everywhere else, `Button` for submit.
- Success state (`state.status === "success"`) and error text
  (`text-red-600` → `text-destructive`) get the same token/component
  treatment.
- Wrap the form in `ElevatedCard` so `/earn` matches `/c`'s card-in-centered-
  column look instead of its current bare `rounded-lg border p-4`.
- No change to `claimEarnAction`, validation, or the `order`/`phone`/`name`
  field set — presentation only.

## Testing

- `ElevatedCard`/`Section` are pure presentational wrappers (already covered
  indirectly per the July 19 spec) — no new tests for the reskin itself.
- Any existing DOM test asserting on a class name being replaced (e.g. a test
  checking for `rounded-2xl` literally) needs its assertion updated to check
  rendered text/role instead — the implementation plan should enumerate these
  by running the existing suite after each file's reskin, not upfront.
- `earn-form.tsx` has no dedicated test today
  (`src/app/earn/earn-form.dom.test.tsx` does not exist) — create one
  mirroring `CheckForm`'s test if one exists, else follow this repo's
  standard component-test pattern (mock `claimEarnAction`, render, assert on
  rendered roles/text for idle/success/error states).
- Full suite (`pnpm check`, `pnpm test`) must stay green throughout — this is
  a mechanical, low-risk pass; any red test is a signal the swap changed
  behavior, not just markup.

## Out of scope

- Any change to `/c` (`src/app/c/page.tsx`) — already well-built, not
  touched.
- Any customer-auth flow (login/signup/password for customers) — researched
  and explicitly rejected, see Decisions.
- Any token/URL redesign for `/c?v=` or `/earn?order=` — checked, no issue
  found.
- Admin table mobile rebuild (stacked cards instead of horizontal scroll) —
  `overflow-x-auto` is the correct pattern for this internal tool, not
  revisited.
- `ProgramCard`'s stretched-link visual container, Wheel/Scratch/Points card
  type visuals — both explicitly out of scope per the July 19 spec and still
  untouched here.
- Any shadcn hand-rolled-element sweep beyond `/earn` — that is loopkit's
  separately tracked Track 3 (templateCentral alignment plan), not part of
  this pass.
