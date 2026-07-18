# `features/card-check` Migration — Design

## Context

This is Phase 2 of Track 2 of the templateCentral alignment work (Phase 1,
`features/auth`, merged in PR #4 — see
`docs/superpowers/specs/2026-07-18-feature-auth-migration-design.md`). Track
2 migrates `src/` from its flat layout to templateCentral's
`src/features/<name>/` convention, one feature at a time.

**Phase order** (agreed during Track 2's original brainstorming; this phase
was originally named `features/customer-portal` — renamed to
`features/card-check` during this phase's own brainstorming, since
exploration showed it's a single check-in page, not a broader portal):

1. `features/auth` — done, merged (PR #4).
2. **`features/card-check`** (this phase, was `app/c/*`).
3. `src/components/{layout,ui,widgets}` split.
4. `features/customers`, `features/stats`, `features/admin`, `features/vendor`.
5. `features/programs` + `features/cards` (done together — most
   interdependent pair).
6. `src/integrations/` (Supabase clients) — last, since everything imports it.

This phase is scoped to `src/app/c/*` only. Every other feature area is
explicitly out of scope for this spec.

## Inventory (verified against the actual repo, not assumed)

**Files today** (`src/app/c/`):

- `actions.ts` — `"use server"`: `checkStatusAction(prevState, formData)`
  (enrolls a phone into every active program at a vendor via the
  `vendor_join` RPC, computes per-card progress via `getProgress` from
  `@/lib/engine`, generates QR via `qrSvg` from `@/lib/qr`) and
  `regenerateCardAction(formData)` (reissues a card via the
  `regenerate_card` RPC). Both rate-limited via `allowRequest` from
  `@/lib/rate-limit`. 216 lines including comments.
- `check-form.tsx` — `"use client"`, exports `CheckForm({ vendorId })`:
  phone-entry form using `useActionState` + `checkStatusAction`, renders a
  `ProgramCardStatus` per returned card. 65 lines.
- `program-card-status.tsx` — `"use client"`, exports
  `ProgramCardStatus({ card, phone })`: renders one program's progress
  card (`Plant`/`Cup`/`FlameLayers`/`Wheel`/`ScratchCard`/`StampDots`/
  `PointsBar` depending on `view.kind`/`view.variant`), handles
  card-regeneration and retired-card-notice `AlertDialog`s. 233 lines.
- `status-state.ts` — plain module (no `"use server"`, importable by both
  server and client code) exporting types `CardStatus`, `StatusState`, and
  constant `STATUS_IDLE`. 27 lines. Exists as its own file specifically
  because a `"use server"` module may only export async functions — the
  shared state shape can't live in `actions.ts`.
- `page.tsx` — default `CheckPage` server component: resolves a vendor's
  active programs from the `v` search param via the
  `vendor_active_programs` RPC, renders `CheckForm`. 60 lines.

**Test file:** `program-card-status.dom.test.tsx` — 4 dom tests for
`ProgramCardStatus` (verifies `PointsBar` vs `StampDots`, `Cup` vs `Plant`
render per `view.variant`). No other test file in the repo references
`src/app/c/*`.

**No external call sites.** Grepped the full `src/` tree for
`@/app/c/` — every match is inside `src/app/c/` itself. Unlike Phase 1's
`requireVendor` (14 external call sites), nothing outside this folder
imports from it. This phase needs **no import-sweep step**.

**Coverage gap, found proactively this time** (Phase 1 hit this as a
same-day emergent CI failure — checking ahead of the plan this time, and
against the **full** suite, not a path-filtered subset — an earlier check
scoped to `src/app/c` alone missed `test/app/check-status-action.test.ts`,
which lives outside that path but tests `src/app/c/actions.ts` directly).
Full-suite `pnpm exec vitest run --coverage` shows:

- `status-state.ts` — 100%. No gap.
- `actions.ts` — 68.86%, missing lines 40-44 (the `allowRequest` rate-limit
  early return) and 122-152 (`regenerateCardAction` in its entirety —
  `checkStatusAction` is the only one of the two actions with real test
  coverage, via `test/app/check-status-action.test.ts`'s 12 tests).
- `check-form.tsx` — 0%. No test exercises this component at all today.
- `program-card-status.tsx` — 51.47%, missing the regenerate-confirm-dialog
  and retired-card-notice-dialog branches (lines 93-195, 203-229). This gap
  **predates** this migration and isn't something the move introduces —
  out of scope for this phase, same reasoning as Phase 1 not fixing
  pre-existing gaps elsewhere in the codebase.
- `page.tsx` — 0%. Out of scope: Phase 1's equivalent thin wrapper
  (`src/app/login/page.tsx`) was never given its own test either, and the
  file shrinks to a two-line render with no branching logic worth testing
  in isolation.

This phase's plan closes the `check-form.tsx` and `regenerateCardAction`
gaps (both genuinely untested, unlike `program-card-status.tsx`'s
pre-existing partial gap) as part of the migration, not as a follow-up.

## Architecture

### New structure

```
src/features/card-check/
  api/
    actions.ts                       — checkStatusAction, regenerateCardAction,
                                        moved verbatim from src/app/c/actions.ts
  components/
    check-form.tsx                   — CheckForm, moved verbatim
    check-form.dom.test.tsx          — NEW, closes the check-form.tsx gap
    program-card-status.tsx          — ProgramCardStatus, moved verbatim
    program-card-status.dom.test.tsx — moved verbatim from
                                        src/app/c/program-card-status.dom.test.tsx,
                                        import paths updated
  types.ts                           — CardStatus, StatusState, STATUS_IDLE,
                                        moved verbatim from
                                        src/app/c/status-state.ts. Lives at
                                        the feature root (sibling to api/
                                        and components/), not inside either
                                        subfolder, because both
                                        api/actions.ts and
                                        components/check-form.tsx import
                                        it — same reasoning as today's
                                        status-state.ts sitting outside
                                        actions.ts.
  index.ts                           — barrel: re-exports CheckForm only.
                                        Nothing else (regenerateCardAction,
                                        checkStatusAction,
                                        ProgramCardStatus, the types) is
                                        imported by anything outside this
                                        feature folder.

test/features/card-check/
  actions.test.ts                    — moved from
                                        test/app/check-status-action.test.ts
                                        (same 12 checkStatusAction tests,
                                        import paths updated), PLUS new
                                        tests for regenerateCardAction
                                        closing that gap
```

Test placement follows Phase 1's precedent: colocated `*.dom.test.tsx`
next to the component it tests (matching `login-form.dom.test.tsx` under
`src/features/auth/components/`), and non-DOM action tests under
`test/features/<name>/` (matching
`test/features/auth/vendor-onboard-action.test.ts`).

### `src/app/c/` after migration (thin wrapper — Next.js requires the route

at this exact path, so it can't move into `src/features/`)

- `src/app/c/page.tsx` — shrinks to a thin wrapper: same `CheckPageProps`
  type, same `vendor_active_programs` RPC call (this RPC call itself is
  page-specific — it resolves which programs to _show before the customer
  types anything_, not part of `checkStatusAction`'s enroll flow — so it
  stays in the route file, not extracted into `features/card-check/api/`),
  renders `<CheckForm vendorId={v} />` imported from `@/features/card-check`.
- `src/app/c/actions.ts`, `check-form.tsx`, `program-card-status.tsx`,
  `program-card-status.dom.test.tsx`, `status-state.ts` — **all deleted**.

### Public API surface

`src/features/card-check/index.ts` exports only `CheckForm` — the one
thing `src/app/c/page.tsx` needs. This matches Phase 1's "internals are
private, only `index.ts` is public" rule, and is intentionally narrower
than auth's barrel (4 exports) since card-check has exactly one external
consumer needing exactly one export.

### Import-path changes (mechanical, no logic changes)

| From                              | To                                              | Files                                                     |
| --------------------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| `@/app/c/actions`                 | `../api/actions` (relative, within the feature) | `check-form.tsx`, `program-card-status.tsx`               |
| `@/app/c/status-state`            | `../types` (relative)                           | `actions.ts`, `check-form.tsx`, `program-card-status.tsx` |
| `@/app/c/check-form`              | `@/features/card-check`                         | `page.tsx`                                                |
| (dom test's imports of the above) | same relative updates                           | `program-card-status.dom.test.tsx`                        |

### README fallout

Per the established per-folder README convention (rich mode, enforced by
the `readme-freshness` CI gate):

- **Regenerate:** `src/app/c/README.md` (content shrinks to describe the
  thin wrapper only)
- **New:** `src/features/card-check/README.md`,
  `src/features/card-check/api/README.md`,
  `src/features/card-check/components/README.md`,
  `test/features/card-check/README.md`
- **Update:** `src/features/README.md`'s Contents list gains a `card-check/`
  bullet (alphabetized after `auth/`)
- **Untouched:** `test/features/auth/README.md`,
  `src/features/auth/README.md` and its subfolders — nothing in this phase
  touches auth.

## Testing

- `src/features/card-check/components/program-card-status.dom.test.tsx`
  (moved): same 4 tests as today, only import paths change
  (`@/app/c/status-state` → `../types` for the `CardStatus` type import,
  `@/app/c/program-card-status` → `./program-card-status`). No new tests
  added — see the coverage-gap note above on why the dialog branches stay
  out of scope.
- `src/features/card-check/components/check-form.dom.test.tsx` (new):
  mock `../api/actions`'s `checkStatusAction` via `vi.hoisted` + `vi.mock`
  (same pattern as Phase 1's `login-form.dom.test.tsx` mocking
  `vendorPhoneOnboardAction`). Cover: renders the phone input and submit
  button; successful submit with `status: "found"` renders one
  `ProgramCardStatus` per returned card; `status: "error"`/`"none"` renders
  the `role="alert"` message; the hidden `vendor` input carries the
  `vendorId` prop through to the action call.
- `test/features/card-check/actions.test.ts`: **moved** from
  `test/app/check-status-action.test.ts` (its 12 existing
  `checkStatusAction` tests, `@/app/c/actions` → `@/features/card-check/api/actions`
  and `@/app/c/status-state` → `@/features/card-check/types` import updates,
  no assertion changes), **plus new tests** for `regenerateCardAction`
  mocking `@/lib/supabase/server`'s `createServerClient` (the
  `regenerate_card` RPC) and `@/lib/rate-limit`'s `allowRequest`: invalid
  phone, missing program id, RPC error, rate-limit exceeded, and success
  paths — closing the gap identified above.
- `pnpm check && pnpm test` must pass after every task in the eventual
  plan, same global constraint as Phase 1.

## Out of scope

- Every other feature area (components split, customers, stats, admin,
  vendor, programs, cards, integrations) — separate phases, separate specs.
- `src/app/dashboard/serve-customer.tsx` (the vendor-side "counter"
  scan/stamp flow) — despite the similar name, this is a different feature
  (dashboard-authenticated, not the public `/c` route) and belongs to a
  later phase's dashboard/vendor feature grouping, not this one.
- Any behavioral change to the check/enroll/regenerate flow — this is a
  pure code-location migration.
- The `vendor_active_programs` RPC call in `page.tsx` staying in the route
  file (see Architecture above) is a deliberate, scoped exception, not an
  oversight.
