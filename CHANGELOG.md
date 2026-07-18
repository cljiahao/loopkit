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

### Fixed

- `.claude/worktrees/` is now excluded from `.gitignore`, `eslint.config.mjs`,
  and `tsconfig.json` — previously only `.prettierignore` knew about it, so
  a sibling worktree's un-migrated source could trip false-positive lint
  errors on a fresh checkout.
