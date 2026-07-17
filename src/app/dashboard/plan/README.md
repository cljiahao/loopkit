# plan

## Purpose

Vendor billing/plan page at `/dashboard/plan` — shows Free vs. Pro feature comparison, program-performance stats, and a self-serve upgrade-request flow.

## Contents

- `actions.ts` — server action `requestUpgrade()`; files an idempotent `upgrade_requests` row for the signed-in vendor (a no-op success if one is already pending).
- `page.tsx` — `PlanPage` server component; requires a vendor, shows current tier badge, an optional program-performance blurb (repeat-visit rate, rewards total), and a Free/Pro feature comparison table with `UpgradeCta` when not Pro.
- `upgrade-cta.tsx` — `UpgradeCta` client component; a button that calls `requestUpgrade()` via `useAsyncAction` and shows a success/error toast.

## Parent

[dashboard](../README.md)
