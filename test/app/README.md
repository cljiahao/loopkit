# app

## Purpose

Vitest tests for `src/app/` Server Actions, layouts, and client components —
Supabase clients and `@/lib` collaborators mocked via `vi.mock`/`vi.hoisted`.

## Contents

- `change-type-action.test.ts` — `changeTypeAction`: free-tier prep-and-activate vs. Pro scheduled-cutover program type migration
- `check-status-action.test.ts` — dashboard "check status" action: resolves a card token to progress via RPC, renders its QR
- `dashboard-actions.test.ts` — misc `src/app/dashboard/actions.ts` Server Actions covering program/card RPC calls
- `dashboard-nav.test.tsx` — jsdom: `DashboardNav` renders the active route highlighted based on `usePathname`
- `preview-state.test.ts` — `buildPreviewProgress`/`buildPreviewProgram`/`buildInitialCard`: `/setup` live-preview state builders
- `profile-actions.test.ts` — vendor `/profile` action: `saveStallName` call after `requireVendor`
- `request-upgrade-action.test.ts` — self-serve Pro upgrade request action: dedupes an already-pending request, inserts a new one
- `resolve-token-action.test.ts` — `resolveTokenAction`: resolves a card token via RPC after `requireVendor`
- `resolve-upgrade-request-action.test.ts` — admin action resolving an upgrade request: grants Pro (upsert), marks the request resolved
- `save-program-action.test.ts` — `saveProgramAction`: create/update dispatch, free/Pro entitlement gate, RPC call shape
- `serve-customer.test.tsx` — jsdom: the `/c` customer card view — stamp/record-visit/lookup/redeem-plant flows end to end
- `set-vendor-pro-action.test.ts` — admin action toggling a vendor's Pro flag: upsert/delete on `vendor_pro`
- `vendor-onboard-action.test.ts` — phone-onboarding action: upserts the vendor's profile row after `requireVendor`

## Parent

[test](../README.md)
