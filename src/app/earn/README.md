# earn

## Purpose

Customer-facing "earn a stamp" claim flow reached via a per-order link (qkit
integration).

## Contents

- `actions.test.ts` — vitest unit tests for `claimEarnAction`: invalid phone, missing/unknown order, stamp commit, already-claimed short-circuit, and non-stamp-program rejection
- `actions.ts` — `claimEarnAction`: `"use server"` action that looks up an order via the `qkit_earn_lookup` RPC, increments/caps the stamp count, and commits via `qkit_earn_commit` (stamp-type programs only, MVP scope)
- `earn-form.dom.test.tsx` — jsdom tests for `EarnForm`: renders labeled phone/name inputs and the hidden order id, shows the vendor name (or a generic fallback), submits to `claimEarnAction` and renders the stamp count on success, shows a `role="alert"` message on error
- `earn-form.tsx` — `EarnForm` client component: `ElevatedCard`-wrapped phone/name form (shadcn `Input`/`Label`/`Button`, matching `/c`'s `CheckForm` pattern) using `useActionState` + `claimEarnAction`, shows the stamp count and reward text on success
- `page.tsx` — `EarnPage` server component: reads the `order` search param, renders `EarnForm` or a "missing order reference" message

## Parent

[app](../README.md)
