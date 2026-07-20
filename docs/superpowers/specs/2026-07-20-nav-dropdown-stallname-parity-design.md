# Nav/Dropdown/Stall-Name qkit Parity — Design Spec

## Problem

Three loopkit surfaces drifted from qkit's already-established pattern, found while
reviewing the just-merged dashboard/setup/profile UI-UX pass (PR #14):

1. **Mobile burger menu** sits in the right-hand header group, next to the account
   avatar. qkit puts it in the left-hand group, next to the wordmark/brand, with the
   avatar always alone on the far right — the standard hamburger-left/account-right
   mobile pattern. loopkit also lacks the tap-away scrim qkit's mobile panel has.
2. **Program switcher dropdown** (`/dashboard/stats`, `/customers`, `/activity`) renders
   _above_ the page's `<h1>` heading, in all 6 call sites (all-programs + single-program
   branch × 3 pages). qkit's equivalent (`StatsControls`) renders as its own block
   _below_ the header.
3. **Stall name is not actually on the shared `merqo.vendor_profile` table.** Social
   links (added in PR #14) correctly write to and read from `merqo.vendor_profile` —
   but stall name still writes to local `loopkit.vendors.name` only
   (`src/lib/vendor.ts:saveStallName`). qkit already fully cut its stall name over to
   merqo: `qkit.vendors.name` is documented as a "stale leftover from before the
   cutover, not yet dropped" (see qkit's `get-entitlement.ts`), and every read there
   overwrites the local value with `merqo.vendor_profile.stall_name`. loopkit never
   made that cut, so a vendor's stall name can drift out of sync with what merqo/other
   kits see.

## Decisions

- All three are independent, low-ambiguity fixes (mirroring code that already exists
  and works in qkit) — bundled into one branch/PR rather than split, per user's call.
- Item 3 is a data write/read-path change, not a schema change: no new migration, no
  backfill. `merqo.vendor_profile` rows are lazily created (`get_or_create_vendor_profile`
  RPC) with the current local name as the default on first read — the same mechanism
  already used for social links and by `/setup`. `loopkit.vendors.name` stays in the
  table (matching qkit's "not yet dropped" stance) but stops being the write target.

## Area 1: Burger menu placement

**File:** `src/app/dashboard/dashboard-nav.tsx`

- Move the burger `<button>` (currently in the right-hand `flex items-center gap-1`
  group alongside the account `DropdownMenu`) into the left-hand group, placed before
  the `Wordmark` `Link` — matching qkit's `Button`-left/`Wordmark`-after ordering.
  Keep it a raw `<button>` with loopkit's existing classes (no switch to the shadcn
  `Button` component — out of scope, qkit's use of `Button` there is incidental, not
  the thing being matched).
- Account `DropdownMenu` becomes the sole occupant of the right-hand group, unchanged
  internally.
- Add a tap-away scrim: a `fixed inset-0 z-30 cursor-default sm:hidden` button,
  `aria-hidden`, `tabIndex={-1}`, `onClick={() => setMobileOpen(false)}`, rendered
  immediately before the existing mobile panel `div` (which moves to `z-40` so it
  layers above the scrim) — matches qkit's scrim exactly.

## Area 2: Program switcher position

**Files:** `src/app/dashboard/stats/page.tsx`, `src/app/dashboard/customers/page.tsx`,
`src/app/dashboard/activity/page.tsx` — 6 call sites total (the all-programs branch and
the single-program branch each render their own header + switcher block).

Pure JSX reorder, no prop or behavior changes: move `<ProgramSwitcher .../>` from
before the `<h1>` to after the header block (`<h1>` + its description `<p>`, where
present), matching qkit's `StatsControls`-after-header ordering.

## Area 3: Stall name → merqo.vendor_profile

**`src/lib/vendor.ts`:**

- `getVendorProfile()`: after reading local `vendors.name`, call
  `getOrCreateVendorProfile(supabase, user.id, localName)` (from
  `@/lib/merqo-vendor-profile`) and return `{ name: profile.stall_name }` instead of
  the local value — mirrors qkit's `loadEntitlement()` overwrite. This is the single
  centralized fix: `dashboard/layout.tsx`, `dashboard/profile/page.tsx`, and
  `setup/page.tsx` all consume `getVendorProfile()` and get the corrected value for
  free, no changes needed at those call sites.
- `saveStallName()`: switch from `supabase.from("vendors").upsert(...)` to
  `getOrCreateVendorProfile` (to read the current `social_links`, preserving them) +
  `upsertVendorProfile(supabase, user.id, name, current.social_links)` — same
  preserve-the-other-field pattern `updateSocialLinksAction` already uses in reverse.

**`src/app/dashboard/profile/actions.ts`:** `updateStallNameAction` is a thin wrapper
around `saveStallName` already — no change needed there beyond what `vendor.ts` does
internally. Its stale comment ("RLS-scoped write to loopkit.vendors") gets corrected.

**Tests:** `test/lib/vendor.test.ts` already exists and covers the local-table
version of both functions — rewrite its Supabase mock to also mock
`@/lib/merqo-vendor-profile`'s `getOrCreateVendorProfile`/`upsertVendorProfile`:

- `getVendorProfile` tests: assert the returned `name` is the merqo
  `stall_name`, not the local `vendors.name` row (the "no row yet" and
  "Supabase errors" cases both need updating — the local `select` becomes just
  the seed value passed into `getOrCreateVendorProfile`).
- `saveStallName` tests: assert `upsertVendorProfile` is called with the
  preserved existing `social_links` (mirroring `updateSocialLinksAction`'s
  "preserving stall name" test in `actions.test.ts`), plus its existing
  invalid-name and Supabase-error cases re-pointed at the new call.

`actions.test.ts`'s existing wholesale `@/lib/vendor` mock needs no change.

## Out of scope

- Dropping the now-fully-vestigial `loopkit.vendors.name` column — matches qkit's own
  current state (column kept, not yet dropped); a future cleanup, not this PR.
- Any change to `social_links` handling — already correct as of PR #14.
- Visual/styling changes beyond the two repositions in Areas 1–2.
