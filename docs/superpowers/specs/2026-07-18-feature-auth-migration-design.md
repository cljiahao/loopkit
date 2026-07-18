# `features/auth` Migration — Design

## Context

This is Phase 1 of Track 2 of the templateCentral alignment work (see
`docs/superpowers/specs/2026-07-17-templatecentral-harness-parity-design.md`
for Track 1, harness/README parity, merged in PRs #1–#2). Track 2 migrates
`src/` from its current flat layout to templateCentral's
`src/features/<name>/` convention, one feature at a time, each phase getting
its own spec → plan → execution cycle.

**Phase order** (agreed during brainstorming, unchanged by this doc):

1. **`features/auth`** (this phase) — smallest, most isolated, establishes
   the migration pattern.
2. `features/customer-portal` (`app/c/*`)
3. `src/components/{layout,ui,widgets}` split
4. `features/customers`, `features/stats`, `features/admin`, `features/vendor`
5. `features/programs` + `features/cards` (done together — most
   interdependent pair)
6. `src/integrations/` (Supabase clients) — last, since everything imports it

This phase is scoped to auth only. Every other feature area is explicitly
out of scope for this spec.

## Inventory (verified against the actual repo, not assumed)

**Files today:**

- `src/lib/auth.ts` — exports `requireVendor(): Promise<{ user: User }>`
- `src/app/login/actions.ts` — exports `vendorPhoneOnboardAction(name, phoneRaw)`, `"use server"`
- `src/app/login/page.tsx` — default `LoginPage`, plus unexported local `LoginForm` and `GoogleMark`, `"use client"`
- `src/app/auth/callback/route.ts` — exports `GET(request)`
- `src/app/reset-password/page.tsx` — default `ResetPasswordPage`, `"use client"`
- `src/proxy.ts` — **not part of this migration** (see below)

**`requireVendor` is not auth-page-specific** — it's the generic
authenticated-vendor guard used by 14 call sites across `dashboard/` and
`setup/`, not just login/auth pages:
`src/lib/program.ts`, `src/lib/vendor.ts`, `src/app/setup/actions.ts`,
`src/app/setup/page.tsx`, `src/app/dashboard/actions.ts`,
`src/app/dashboard/activity/page.tsx`, `src/app/dashboard/counter/page.tsx`,
`src/app/dashboard/layout.tsx`, `src/app/dashboard/customers/page.tsx`,
`src/app/dashboard/page.tsx`, `src/app/dashboard/plan/page.tsx`,
`src/app/dashboard/profile/page.tsx`, `src/app/dashboard/settings/page.tsx`,
`src/app/dashboard/stats/page.tsx`. Every one of these gets an import-path
update only (`@/lib/auth` → `@/features/auth`) — no logic change.

**Test files mocking `@/lib/auth`** (path update only, files stay where they
are — they test code that isn't moving):
`src/app/dashboard/counter/counter-page.dom.test.tsx`,
`test/app/dashboard-actions.test.ts`, `test/app/change-type-action.test.ts`,
`test/lib/vendor.test.ts`, `test/app/save-program-action.test.ts`,
`test/app/resolve-token-action.test.ts`, `test/app/profile-actions.test.ts`.

**`test/app/vendor-onboard-action.test.ts`** tests `vendorPhoneOnboardAction`
directly (not just mocking it) — this one _does_ move, since the code it
tests is moving. New location: `test/features/auth/vendor-onboard-action.test.ts`.

**`src/proxy.ts` is confirmed unrelated and out of scope.** It imports
`updateSession` from `src/lib/supabase/middleware.ts` directly — no
relationship to `src/lib/auth.ts` at all, verified by reading both files.
Next.js also requires it at that exact root path. Not touched by this
migration.

**`requireVendor` has zero direct test coverage today** — `test/lib/auth.test.ts`
does not exist; the function is only ever mocked (via `vi.mock`) in the 8
files above, never tested against its real implementation.

## Architecture

### New structure

```
src/features/auth/
  api/
    require-vendor.ts    — requireVendor(), moved verbatim from src/lib/auth.ts
    actions.ts            — vendorPhoneOnboardAction(), moved verbatim from
                             src/app/login/actions.ts (including its inline
                             nameSchema — one Zod line, not worth a schemas/
                             subfolder for this phase; phone validation
                             already lives in the untouched shared @/lib/phone)
  components/
    login-form.tsx         — LoginForm + GoogleMark, extracted from
                             src/app/login/page.tsx (currently unexported
                             locals in that file)
    reset-password-form.tsx — the current default-export body of
                             src/app/reset-password/page.tsx, renamed to
                             ResetPasswordForm and exported (not default)
  index.ts                 — barrel: re-exports requireVendor,
                             vendorPhoneOnboardAction, LoginForm,
                             ResetPasswordForm

test/features/auth/
  require-vendor.test.ts        — NEW, closes the zero-coverage gap above
  vendor-onboard-action.test.ts — moved from test/app/vendor-onboard-action.test.ts
```

### `src/app/` after migration (thin wrappers — Next.js requires routes at

these exact paths, so they can't move into `src/features/`)

- `src/app/login/page.tsx` — shrinks to a `Suspense` wrapper around
  `<LoginForm />` imported from `@/features/auth`. `src/app/login/actions.ts`
  is deleted (its one export now lives in `features/auth/api/actions.ts`,
  imported directly by `login-form.tsx`).
- `src/app/reset-password/page.tsx` — shrinks to
  `export default function ResetPasswordPage() { return <ResetPasswordForm />; }`.
- `src/app/auth/callback/route.ts` — **left untouched, not extracted into
  `features/auth/api/`.** It's 25 lines, has zero other importers anywhere
  in the repo (reached only via HTTP redirect from Supabase, never called as
  a module), and is inherently route-handler-shaped (URL param parsing +
  one redirect). Extracting its 2-line Supabase call into a separate
  `features/auth/api/` file would add an indirection layer with no reuse
  benefit. This is a deliberate, scoped exception — not an oversight.

### Public API surface

`src/features/auth/index.ts` is the only import path external consumers use.
Dashboard/setup files import `{ requireVendor }` from `@/features/auth` —
never reach into `@/features/auth/api/require-vendor` directly. This matches
templateCentral's "pages compose from features" convention: a feature's
internals (`api/`, `components/`) are private; only `index.ts` is public.

### Import-path changes (mechanical, no logic changes)

| From                                               | To                                | Files                                                                  |
| -------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| `@/lib/auth` (`requireVendor`)                     | `@/features/auth`                 | 14 files listed above                                                  |
| `@/app/login/actions` (`vendorPhoneOnboardAction`) | `@/features/auth`                 | `login-form.tsx` (the file itself moves and becomes the sole importer) |
| `vi.mock("@/lib/auth", ...)`                       | `vi.mock("@/features/auth", ...)` | 8 test files listed above (7 stay in place, 1 moves)                   |

### README fallout

Per Track 1's per-folder README convention (rich mode, enforced by the
`readme-freshness` CI gate):

- **Regenerate:** `src/app/login/README.md`, `src/app/reset-password/README.md`
  (content shrinks to thin wrappers)
- **New:** `src/features/README.md`, `src/features/auth/README.md`,
  `src/features/auth/api/README.md`, `src/features/auth/components/README.md`,
  `test/features/README.md`, `test/features/auth/README.md`
- **Untouched, no regen needed:** `src/app/auth/README.md`,
  `src/app/auth/callback/README.md` (neither file in that subtree changes)
- Root `README.md`'s `## Structure` section (Task 15, Track 1) doesn't
  enumerate `src/features/` as a peer of `src/` today since it didn't exist
  yet — this phase adds it as a `src/` subfolder in the Contents list of
  `src/README.md`, not as a new root-level bullet.

## Testing

- `test/features/auth/require-vendor.test.ts` (new): mock
  `@/lib/supabase/server`'s `createServerClient`, assert (a) `redirect("/login")`
  is called and the function does not return a user when
  `auth.getUser()` resolves with `user: null`, (b) `{ user }` is returned
  and `redirect` is not called when a user is present. Follow this repo's
  existing `vi.hoisted` + `vi.mock` pattern (see any file in the 8-file
  mock list above for the exact style).
- `test/features/auth/vendor-onboard-action.test.ts` (moved): same test
  content as today, only the import path and `vi.mock` target change.
- All 7 other test files: only their `vi.mock("@/lib/auth", ...)` line
  changes to `vi.mock("@/features/auth", ...)`; assertions unchanged.
- `pnpm check && pnpm test` must pass after every task in the eventual plan,
  same global constraint as Track 1.

## Out of scope

- Every other feature area (customer-portal, components split, customers,
  stats, admin, vendor, programs, cards, integrations) — separate phases,
  separate specs.
- `src/proxy.ts` — confirmed unrelated, not touched.
- Any behavioral change to auth flows (OAuth, email/password, phone
  onboarding, password reset) — this is a pure code-location migration.
- Adding new auth features or changing the login/reset-password UI beyond
  what the component extraction mechanically requires.
