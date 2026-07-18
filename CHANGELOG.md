# Changelog

All notable changes to loopkit are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Auth code (`src/lib/auth.ts`, `src/app/login/actions.ts`, and the
  login/reset-password UI) moved into `src/features/auth/` — a pure
  code-location migration, no behavioral change. External consumers now
  import from `@/features/auth`.

### Fixed

- `.claude/worktrees/` is now excluded from `.gitignore`, `eslint.config.mjs`,
  and `tsconfig.json` — previously only `.prettierignore` knew about it, so
  a sibling worktree's un-migrated source could trip false-positive lint
  errors on a fresh checkout.
