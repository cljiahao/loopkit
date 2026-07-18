# card-check

## Purpose

The public, unauthenticated card-check flow reached via `/c?v=<vendorId>` —
a customer checks or enrolls their loyalty card by phone number, and can
self-service regenerate a lost/expired card.

## Contents

- `api/`
- `components/`
- `index.ts` — barrel re-exporting `CheckForm`
- `types.ts` — shared `CardStatus`/`StatusState` types and the
  `STATUS_IDLE` constant

## Connectivity

`index.ts` is the only path external code should import from —
`src/app/c/page.tsx` imports `CheckForm` through it. `api/` and
`components/` are private implementation, consumed internally by
`index.ts` and by each other (`components/check-form.tsx` imports
`checkStatusAction` from `../api/actions`, `components/program-card-status.tsx`
imports `regenerateCardAction` from `../api/actions`).

## Parent

[features](../README.md)
