# api

## Purpose

Server-side card-check logic: the two public `"use server"` actions behind
`/c?v=<vendorId>`.

## Contents

- `actions.ts` — `checkStatusAction`: no-auth action that enrolls a phone
  into every active program at a vendor via the `vendor_join` RPC (which
  also returns every card the phone already holds there), then computes
  per-card progress with `getProgress` and a QR (`qrSvg`) for each row —
  rate-limited via `allowRequest("c-check")`; `regenerateCardAction`:
  reissues one program's card via the `regenerate_card` RPC for a lost or
  expired card, same phone-as-identity trust model and rate limit, acting
  on one program at a time (invoked per-card from the check-form's card
  list)

## Connectivity

N/A — no subfolders. Note that `types.ts` (the shared `CardStatus`/
`StatusState` types `actions.ts` returns) lives one level up at the
feature root, not inside this folder, since both `api/actions.ts` and
`components/check-form.tsx` import it.

## Parent

[card-check](../README.md)
