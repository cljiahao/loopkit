# c

## Purpose

Customer-facing, unauthenticated QR-entry flow — a customer checks or
enrolls their loyalty card at a vendor's stall by phone number.

## Contents

- `actions.ts` — `"use server"` actions: `checkStatusAction` (enrolls a phone into every active program at a vendor via the `vendor_join` RPC and computes per-card progress) and `regenerateCardAction` (reissues a lost/expired card via the `regenerate_card` RPC)
- `check-form.tsx` — `CheckForm` client component: phone-entry form using `useActionState` + `checkStatusAction`, renders a `ProgramCardStatus` per returned card
- `page.tsx` — `CheckPage` server component: resolves a vendor's active programs from the `v` search param via the `vendor_active_programs` RPC, renders `CheckForm`
- `program-card-status.dom.test.tsx` — jsdom tests for `ProgramCardStatus`: verifies `PointsBar` vs `StampDots` and `Cup` vs `Plant` render per `view.variant`
- `program-card-status.tsx` — `ProgramCardStatus` client component: renders one program's progress card (`Plant`/`Cup`/`FlameLayers`/`Wheel`/`ScratchCard`/`StampDots`/`PointsBar` depending on `view.kind`), handles card-regeneration and retired-card-notice dialogs
- `status-state.ts` — shared `CardStatus`/`StatusState` types and the `STATUS_IDLE` constant, imported by both `actions.ts` and `check-form.tsx`

## Parent

[app](../README.md)
