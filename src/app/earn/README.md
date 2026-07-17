# earn

## Purpose

Customer-facing "earn a stamp" claim flow reached via a per-order link (qkit
integration).

## Contents

- `actions.test.ts` — vitest unit tests for `claimEarnAction`: invalid phone, missing/unknown order, stamp commit, already-claimed short-circuit, and non-stamp-program rejection
- `actions.ts` — `claimEarnAction`: `"use server"` action that looks up an order via the `qkit_earn_lookup` RPC, increments/caps the stamp count, and commits via `qkit_earn_commit` (stamp-type programs only, MVP scope)
- `earn-form.tsx` — `EarnForm` client component: phone/name form using `useActionState` + `claimEarnAction`, shows the stamp count and reward text on success
- `page.tsx` — `EarnPage` server component: reads the `order` search param, renders `EarnForm` or a "missing order reference" message

## Parent

[app](../README.md)
