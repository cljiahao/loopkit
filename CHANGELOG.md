# Changelog

All notable changes to loopkit are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
  (Stamp Card, Sprout, Chance Card, Lucky Tap) with a style sub-step,
  instead of one flat grid of 8 tiles. Purely a picker UI change — every
  family/style combination still saves the exact same `type`/`variant`
  pair as before (e.g. Stamp Card → Flame Club still saves
  `type=stamp, variant=flame`), so existing programs and the engine are
  unaffected.

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
