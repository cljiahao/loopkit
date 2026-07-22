# Changelog

All notable changes to loopkit are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- `/setup`'s Chance Card (Wheel/Scratch) Basics segment editor now displays
  live win-chance percentages: an "Overall win chance: NN%" summary above the
  segment list, and an "≈NN%" badge next to each segment's weight input.
  Implemented via new pure helpers `segmentWinPercent`/`overallWinPercent` in
  `src/lib/program-config.ts` (using the same weight math that `chance.ts`'s
  `pickSegment` uses internally to determine winners). The weight input itself
  is unchanged — this display is additive, letting vendors see actual odds
  instead of raw weight numbers.
- `/setup`'s Basics/Rules copy trimmed to one short line per field; longer
  rationale or edge-case explanations (head-start's completion-lift claim,
  the wheel/scratch odds-weight meaning, how card-expiry differs from
  reward-expiry) moved into a new tap-to-open `(i)` info tooltip
  (`InfoTooltip`, `ui/popover.tsx`) instead of a second paragraph or a
  hover-only native `title` attribute, which never worked on mobile.

### Fixed

- The dashboard account-menu trigger showed only the bare avatar — the
  stall name was visible only once the dropdown was opened, unlike qkit's
  trigger which shows the name (or an "Account" fallback) plus a chevron
  beside the avatar at `md:` and up. Now matches.
- The dashboard account-dropdown label leaked the vendor's email — as the
  primary line when no stall name was set, or as the subtitle when one
  was. Now matches qkit's dropdown exactly: stall name (or a "Your stall"
  placeholder) as the primary line, a static "Vendor account" subtitle
  always, no email in either.
- `/dashboard/profile`'s two-column layout used CSS `columns-2` (visual
  order could drift from DOM/tab order) with the wrong section order;
  rebuilt onto two independent flex-column stacks with the locked
  cross-kit order (column 1: stall name, profile icon, change password;
  column 2: display name, social links).
- The dashboard's shared shop QR block overflowed its card on mobile: the
  link-text container's parent used `items-start` in the mobile
  (`flex-col`) layout, which sizes flex children to their own content
  width rather than the container's width, so `min-w-0`/`truncate` on the
  long URL never actually took effect. Fixed with a `self-stretch`
  (mobile) / `self-auto` (`sm:` and up) override.
- `/dashboard/customers`'s program-switcher + search row could overflow on
  narrow phones (the search `<input>` had no `min-w-0`, so it refused to
  shrink below its intrinsic width, pushing the Search button off-screen);
  now stacks the switcher above a full-width search form below the `sm`
  breakpoint, matching the activity filters' existing mobile pattern.
- `/dashboard/activity`'s program switcher sat as a bare, unlabeled,
  differently-styled control (no border/shadow, no shared card) next to
  the bordered/shadowed `ActivityFilters` card, and didn't stack full-width
  on mobile like the filter fields did. `ProgramSwitcher` now composes as
  that card's first field (a "Program" label + trigger matching Type's
  styling and mobile stacking) instead of a separate sibling — `ProgramSwitcher`
  gained optional `triggerId`/`triggerClassName` props for this, defaulting
  to its existing bare look on Customers/Stats.
- `GET /api/merqo/vendor-status` and the `/admin` console's vendor-email
  lookup (`admin-data.ts`) both only ever read the first 1000 auth users
  (`listUsers`' default page size) — past that, a vendor would silently
  resolve as "inactive" to merqo, or go missing from the admin console.
  Extracted a shared `listAllUsers()` (`src/lib/list-all-users.ts`) that
  paginates to completion; both call sites now use it.

### Added

- `Stats` gains an "Expired unclaimed (30d)" tile, sourced from the
  `reward_vouchers` ledger (`countExpiredVouchers`) — added alongside,
  not replacing, the existing `stamp_events`-sourced `rewards30d`/
  `redemptionRate` tiles, per
  `docs/superpowers/specs/2026-07-16-reward-voucher-ledger-design.md`'s
  explicit decision not to risk a regression migrating those.
- Test coverage for the `/admin` console's data layer (`admin.ts`,
  `admin-data.ts`) and `rate-limit.ts`, previously untested — the one
  surface handling cross-vendor sensitive data had zero automated
  coverage.
- `e2e/route-protection.spec.ts`: signed-out redirects for
  `/dashboard`/`/setup`, a signed-out 404 for `/admin`, and the
  no-DB-call fallback copy for `/c`/`/earn` without their required query
  param — the e2e suite's first coverage of anything beyond the public
  landing/login smoke pages.

### Changed

- Theme rewritten from "Mulberry & Gold" to "Raspberry-Rose Punch & Gold" —
  a deep-research pass (BMC Psychology 2025; Royal Society Open Science
  2023, both adversarially verified) found brightness and saturation, not
  hue family, are the dominant drivers of whether a color reads as
  "rewarding"/"celebratory" vs. "moody," and that darkness itself isn't
  disqualifying, only darkness combined with low saturation. `--primary`
  moves from a dark, desaturated magenta-plum (`oklch(0.4 0.12 350)`
  light / `oklch(0.63 0.15 350)` dark) to a substantially brighter, more
  saturated raspberry-red (`oklch(0.6 0.19 15)` light /
  `oklch(0.68 0.17 15)` dark) — warmer and clear of qkit's ember hue range
  (~45-60°). Dark mode's canvas stays genuinely dark (not just lightened)
  but warmly tinted, with the brightness/saturation the "celebratory" read
  depends on concentrated in `--primary`/`--ring`, matching how real
  gamified-reward products (Duolingo) pair a bright saturated core hue with
  a bold accent rather than a dark muted one. `--destructive`'s hue nudged
  27°→32° to stay clearly distinct from the new, much-closer primary hue.
  The gold reward accent is unchanged. The favicon/brand-icon
  (`src/lib/brand-icon.tsx`, `BRAND_MULBERRY` renamed `BRAND_RASPBERRY`)
  and the root `global-error.tsx` fallback (hand-converted hex, can't use
  CSS variables) both updated to match.
- App-wide UI-UX consistency pass: dashboard sub-pages (stats, customers,
  activity, plan, settings), the admin console, and the auth forms now use
  the `ElevatedCard`/`Section` visual language introduced for
  dashboard/setup/profile — presentational only, no behavior or copy
  change. Fixed the activity filters wrapping awkwardly on narrow phones
  (fields now stack full-width below the `sm` breakpoint). Rebuilt
  `/earn`'s customer-facing form onto shadcn components (previously the
  one hand-rolled, unstyled form in the app), with new test coverage.

### Added

- Reward-voucher ledger (`loopkit.reward_vouchers`, migration
  `0027_loopkit_reward_vouchers.sql`): every earned reward across all
  program types (Stamp, Plant, Wheel, Scratch, Lucky) now creates a voucher
  row with `active`/`redeemed`/`expired` status. Redeem actions now require
  an active, non-expired voucher rather than only checking raw
  `stamp_count`/`growth` against the threshold.
- New `programs.reward_expiry_days` config (1–3650 days, optional) lets
  vendors set an expiry window for unclaimed Stamp/Plant rewards. Expiry is
  checked lazily — on `add_stamp`, Plant's `apply`, and the counter's
  lookup action — and forfeits the expired voucher's threshold worth of
  `stamp_count`/`growth` (floored at 0). No cron job required.
- Setup form: new reward-expiry field for program types that support it.
- Profile settings: a new "Social & website" section (website/Instagram/
  Facebook/TikTok), backed by the shared `merqo.vendor_profile` table
  loopkit already partially used (`/setup`'s vendor-name seeding). Ported
  from qkit's identical feature.

### Changed

- Auth code (`src/lib/auth.ts`, `src/app/login/actions.ts`, and the
  login/reset-password UI) moved into `src/features/auth/` — a pure
  code-location migration, no behavioral change. External consumers now
  import from `@/features/auth`.
- Card-check code (`src/app/c/actions.ts`, `check-form.tsx`,
  `program-card-status.tsx`, `status-state.ts`) moved into
  `src/features/card-check/` — a pure code-location migration, no
  behavioral change. `src/app/c/page.tsx` now imports `CheckForm` from
  `@/features/card-check`.
- Sprout (Plant) and Fill the Cup (Cup) progress visualizations now grow
  smoothly and continuously between visits instead of snapping to each new
  stage: Cup's liquid-fill transition widens from 500ms to 1600ms, Plant's
  stem now animates via a `scaleY` transform (previously it didn't animate
  at all — its old resized-`<line>` approach used non-CSS-animatable
  endpoint attributes), leaf pairs fade in one at a time without
  repositioning already-placed leaves, and both components' final-stage
  treat (bloom / latte-art) fades and scales in instead of popping. Purely
  visual/timing — no prop or behavioral changes, so this applies wherever
  these components render (`/setup`'s live preview, the vendor's
  serve-customer stamp screen, and the customer's `/c` card view).
- Dashboard: the vendor's program card is now tappable anywhere to open its
  counter page, replacing the separate "Open Counter" button. The pencil
  edit link stays independently tappable. A small chevron signals the card
  opens something.
- `/setup` no longer shows the "Your programs" management list alongside
  the create form (or any other action view) — bare `/setup` is now a
  clean create/upsell page, and the list moved behind a new
  `/setup?manage=1` view reached via a new "Manage your programs" link.
- `/setup`'s card-type picker now groups its 8 styles into 4 families
  (Stamp Card, Growth, Points Club, Chance Card) with a style sub-step,
  instead of one flat grid of 8 tiles. Flame Club moved from Stamp Card
  into a new Growth family (alongside Sprout and Fill the Cup); Points Club
  became its own single-style family (previously sharing Stamp Card); Lucky
  Tap moved from a standalone family into Chance Card (grouping the three
  random-draw-per-visit mechanics: Wheel, Scratch, Lucky Tap). Purely a
  picker UI change — every family/style combination still saves the exact
  same `type`/`variant` pair as before (e.g. Stamp Card → Dots still saves
  `type=stamp, variant=dots`; Growth → Flame still saves
  `type=stamp, variant=flame`), so existing programs and the engine are
  unaffected.
- New shared `Section`/`ElevatedCard` primitive (rounded corners, soft
  lifted shadow, icon-badge header) replaces the plain `Card`-based blocks
  on profile settings, the dashboard, and `/setup`'s create-card form.
  Deliberately not qkit's scalloped "kitchen ticket" look — that's
  food-stall-specific branding qkit owns; loopkit borrows only the
  spacing/hierarchy pattern.
- Dashboard: the Shop QR block and "Scan a customer" button are now a
  side-by-side quick-actions row instead of two stacked full-width blocks
  (stacks back to full-width on mobile), and the program grid now has a
  "Your programs" heading.
- `/setup`'s live preview now docks in a sticky side column on desktop
  instead of scrolling away while filling in a long Rules section (e.g.
  the Wheel/Scratch segment editor); the type picker, Basics, and Rules
  cards become one flowing main column instead of a 2-column split.
- Stall name now reads from and writes to the shared `merqo.vendor_profile`
  table (matching qkit's own cutover) instead of the local
  `loopkit.vendors.name` column — social links already worked this way.
  Mobile burger menu moved to the left of the header (next to the wordmark,
  matching qkit) instead of next to the account avatar, and gained a
  tap-away scrim. The program-switcher dropdown on Stats/Customers/Activity
  now renders below the page header instead of above it.

### Fixed

- `.claude/worktrees/` is now excluded from `.gitignore`, `eslint.config.mjs`,
  and `tsconfig.json` — previously only `.prettierignore` knew about it, so
  a sibling worktree's un-migrated source could trip false-positive lint
  errors on a fresh checkout.
- `/setup`'s "Schedule retirement" action was silently unreachable for Pro
  vendors — `canCreate` is unconditionally true for Pro (unlimited
  programs), so the old view-routing check let it always win over the
  `schedule` query param, showing the create form instead. Fixed via a new
  `resolveSetupView` precedence that gives explicit query-param intents
  priority over the ambient `canCreate` default.
- Opening any Radix dropdown/dialog (e.g. the dashboard's account menu)
  could visibly shift the centered page content, since the scrollbar's
  gutter wasn't reserved ahead of time — `scrollbar-gutter: stable` now
  keeps that space allocated whether or not a scrollbar is actually shown.
- Dashboard's Shop QR + Scan quick-actions row could stretch wider than its
  card (pushing the QR link/labels past their intended width) — the two
  flex children were missing `min-w-0`, so neither could shrink below its
  content's natural width.
