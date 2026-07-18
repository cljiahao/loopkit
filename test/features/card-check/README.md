# card-check

## Purpose

Tests for `src/features/card-check/`'s non-DOM server actions — Supabase
client, `qrSvg`, and `allowRequest` mocked via `vi.mock`/`vi.hoisted`.

## Contents

- `actions.test.ts` — `checkStatusAction`: rejects an invalid phone or a
  missing vendor without calling the RPC, returns the rate-limit error
  without calling the RPC when `allowRequest` denies the attempt, calls
  `vendor_join` with the normalized phone, returns one card per row (using
  `stamp_count`, not the state blob), handles multiple programs at once,
  marks a card inactive without dropping it when its program is no longer
  active, surfaces a retired card's replacement name and carried-over
  stamp count, reports `expired` once a card's expiry window has elapsed,
  reports `"none"` when `vendor_join` returns no rows, and surfaces an
  error without throwing when the RPC fails; `regenerateCardAction`:
  rejects an invalid phone or missing program id without calling the RPC,
  returns the rate-limit error without calling the RPC, reports an error
  when the RPC fails or returns no card, and calls `regenerate_card` with
  the normalized phone on success

## Parent

[features](../README.md)
