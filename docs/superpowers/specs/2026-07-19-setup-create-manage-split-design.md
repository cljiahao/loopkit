# `/setup` create/manage split — Design

## Context

Item 2 of 3 in the loopkit UX cleanup (item 1, the dashboard tappable card,
shipped in PR #11). Today `src/app/setup/page.tsx` shows the "Your
programs" management list (Edit / Change type / Prep replacement /
Activate / Schedule retirement / Manage per program) at the same time as
whatever action view is active — including the plain create form, which is
exactly where the dashboard's `NewProgramTile` (`src/app/dashboard/new-program-tile.tsx`)
sends a vendor who just wants to add a program. The ask: split "create" and
"manage" into separate views.

## Current state (verified against the actual file, 316 lines)

- The list block's render condition is `!isEdit && !migrating &&
programs.length > 0` — **not** `!isEdit && !migrating && !prepping &&
!scheduling`. So the list also clutters the Prep-replacement and
  Schedule-retirement forms today, not just Create. This was presumably an
  oversight when `prep`/`schedule` were added later, not intentional.
- Below that, a single ternary picks exactly one of five view blocks:
  `isEdit || migrating || canCreate` → the shared create/edit/migrate form,
  else `prepping` → prep form, else `scheduling` → schedule form, else → the
  "Free plan: 1 program" upsell card. Title/subtitle strings are built with
  their own parallel ternaries.
- **Real pre-existing bug found while tracing this precedence**: for Pro
  vendors, `canCreateProgram` (`src/lib/program.ts`) returns `true`
  unconditionally (`maxActivePrograms === null` for the `PRO` entitlement).
  Since the first branch is `isEdit || migrating || canCreate`, a Pro
  vendor visiting `/setup?schedule=<id>` (the exact link the list's own
  "Schedule retirement" row generates) has `canCreate === true`, so this
  branch wins and renders the **create form**, never reaching the
  `scheduling` branch below it. The Schedule-retirement feature is
  effectively unreachable for Pro vendors today. (`Prep replacement` isn't
  affected the same way — its link only renders for `!pro`, and free-tier
  `canCreate` is false whenever a vendor is already at their 1-active-program
  cap, which is the only situation prep's link appears in — so no vendor-facing
  path hits that particular collision.) Since this task rewrites this exact
  ternary, the fix is folded in here rather than filed separately.
- `NewProgramTile` links bare `href="/setup"` — unaffected by this spec, no
  change needed.
- No test file exists for `src/app/setup/page.tsx` today (verified: no
  match in `test/` or colocated). Given the file's own data-fetching
  (Supabase, `requireVendor`, `merqo` cross-schema calls) makes it
  expensive to unit-test directly, and this codebase has an established
  precedent for exactly this situation —
  `src/app/dashboard/dashboard-view.ts`'s `shouldShowQr`, a pure function
  extracted so branching logic gets fast, unmocked coverage without
  rendering the whole async server component (see
  `src/app/dashboard/dashboard-view.test.ts`) — this spec follows the same
  pattern.

## Design

### New pure module: `src/app/setup/setup-view.ts`

Extracts the "which single view wins" decision into a testable pure
function, mirroring the `dashboard-view.ts` precedent:

```ts
export type SetupView =
  "migrate" | "edit" | "prep" | "schedule" | "manage" | "create" | "upsell";

// Which single view /setup renders, given every explicit query-param
// intent and the ambient canCreate permission. Explicit intents (an actual
// query param was set — migrate/edit/prep/schedule/manage) always win over
// the ambient default (canCreate deciding between "create" and "upsell").
// This fixes a real bug: canCreate is unconditionally true for Pro vendors
// (unlimited programs), so the previous combined
// `isEdit || migrating || canCreate` check made `schedule`'s explicit
// query param unreachable for any Pro vendor — canCreate always won first.
export function resolveSetupView({
  migrating,
  isEdit,
  prepping,
  scheduling,
  managing,
  canCreate,
}: {
  migrating: boolean;
  isEdit: boolean;
  prepping: boolean;
  scheduling: boolean;
  managing: boolean;
  canCreate: boolean;
}): SetupView {
  if (migrating) return "migrate";
  if (isEdit) return "edit";
  if (prepping) return "prep";
  if (scheduling) return "schedule";
  if (managing) return "manage";
  return canCreate ? "create" : "upsell";
}
```

`firstRun` is not its own `SetupView` — it's a copy variation of `"create"`
(today's `firstRun ? "Set up your loyalty card" : "Create a program"`
ternary stays in `page.tsx`, unchanged in spirit, just now keyed off
`view === "create"` instead of the old combined condition).

### `page.tsx` changes

- `searchParams` type gains `manage?: string`.
- Compute `managing = manage === "1"` and pass the six inputs into
  `resolveSetupView` to get `view: SetupView`.
- Title/subtitle ternaries key off `view` instead of the ad hoc boolean
  chain (same six text pairs as today, migrate/prep/schedule/edit copy
  unchanged verbatim; the old default-branch text "Your loyalty programs" /
  "Manage your loyalty programs." moves to `view === "manage"`; a **new**
  default copy "Create a program" / "Pick a card type and set how customers
  earn their reward." — identical to today's existing create copy, just now
  reached only when `view === "create"` and not `firstRun`).
- Replace the two separate conditional blocks (list block + form ternary)
  with **one** `switch`/ternary keyed off `view`, six arms: `"manage"`
  (today's list content, moved verbatim, plus a new "+ New program" link —
  see below), `"migrate"`/`"edit"`/`"create"` (today's shared form block,
  unchanged), `"prep"` (unchanged), `"schedule"` (unchanged), `"upsell"`
  (unchanged).
- New link, "Manage your programs", rendered in the header area (after the
  subtitle `<p>`, before the view content) whenever `view === "create" &&
programs.length > 0` — i.e. only on the plain default view, not on
  edit/migrate/prep/schedule (which are already single-purpose, focused
  views) and not when `firstRun` (nothing to manage yet). Points to
  `/setup?manage=1`.
- Inside the `"manage"` arm, add a "+ New program" link next to the "Your
  programs" heading, pointing to bare `/setup` — clicking it always lands
  on a valid state (`view` resolves to `"create"` or `"upsell"` there based
  on `canCreate`, so no extra gating needed on the link itself).

### What's explicitly unchanged

- `SetupForm`, `ScheduleRetirementForm`, `activateProgramAction` — no
  prop or behavior changes.
- Every per-row link's `href` in the list (Edit/Change type/Prep
  replacement/Activate/Schedule retirement/Manage) — verbatim, same
  targets.
- `NewProgramTile` (`src/app/dashboard/new-program-tile.tsx`) — still links
  bare `/setup`, which now resolves to `view === "create"` (or `"upsell"`)
  exactly as it expects.

## Testing

- **New `src/app/setup/setup-view.test.ts`**: one test per `SetupView`
  outcome (7 cases) plus the specific regression case for the bug fixed
  here — `resolveSetupView({ migrating: false, isEdit: false, prepping:
false, scheduling: true, managing: false, canCreate: true })` must return
  `"schedule"`, not `"create"` (this is exactly the Pro-vendor collision
  described above — asserting it stays fixed).
- No changes needed to any other existing test file — nothing else in the
  test suite touches `src/app/setup/page.tsx` or `setup-view.ts` today.
- `pnpm check && pnpm test` must pass.

## Out of scope

- Item 3 (program-type consolidation) — separate, later spec.
- Any change to `SetupForm`'s internal fields/behavior, `ScheduleRetirementForm`,
  or the Supabase RPCs those call.
- Redesigning the list's own visual styling — moved verbatim into the new
  `"manage"` view, not restyled.
- A dedicated `/setup/manage` route — uses a query param (`?manage=1`) on
  the existing page, matching this codebase's established convention of
  query-param-driven view switching on `/setup` (`edit`/`migrate`/`prep`/`schedule`
  all already work this way).
