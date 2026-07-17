# test

## Purpose

Vitest test suite root for loopkit — Server Actions, route handlers, `src/lib`
domain logic, components, migration drift guards, and the merqo contract
check.

## Contents

- `api/`
- `app/`
- `components/`
- `contract/`
- `db/`
- `lib/`
- `setup.ts` — global vitest setup: jsdom polyfills (`hasPointerCapture`, `scrollIntoView`, `ResizeObserver`, `matchMedia`, `HTMLImageElement.complete`) Radix components need, plus a global `afterEach` calling Testing Library's `cleanup()`

## Connectivity

Mirrors `src/`'s shape: `app/` tests Server Actions/route handlers/client
components under `src/app/`, `lib/` tests `src/lib/` (with `lib/engine/`
mirroring `src/lib/engine/`), `components/` tests `src/components/`.
`db/` tests are independent of the others — they regex-check
`supabase/migrations/` SQL text rather than importing any TypeScript.
`contract/` guards the one cross-repo boundary (loopkit's metrics payload
vs. merqo's schema). `setup.ts` is loaded by every test file per
`vitest.config.ts`.

## Parent

[loopkit](../README.md)
