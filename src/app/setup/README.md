# setup

## Purpose

Vendor onboarding and program-management flow at `/setup` — create, edit, migrate (change type), prep a replacement, activate, or schedule retirement for loyalty programs, with a live animated preview of the customer card.

## Contents

- `actions.ts` — server actions `saveProgramAction` (create/edit, enforces the free/Pro program-count gate), `changeTypeAction` (retire-and-replace flow for switching a program's type), `prepProgramAction` (free-tier: create a hidden second program), `activateProgramAction` (flips a prepped program to active), and `scheduleRetirementAction` (Pro-only: schedules a future cutover date to a successor program).
- `page.tsx` — `SetupPage` server component; requires a vendor, applies due scheduled cutovers, seeds/reads the shared `merqo.vendor_profile` row (degrading to null on failure), and renders the programs list plus the appropriate mode (`SetupForm` for create/edit/migrate/prep, `ScheduleRetirementForm` for scheduling, or a Pro-upsell `ProLock`).
- `preview-animation.dom.test.tsx` — jsdom test covering `usePreviewAnimation`'s ticking, celebrate-then-reset, head-start-seeded reset, immediate restart on recipe change, real win/loss rolls for lucky/wheel/scratch, and the reduced-motion static fallback.
- `preview-animation.ts` — `usePreviewAnimation()` hook; drives the real `applyVisit()`/`getProgress()` engine on a 2s timer to simulate a customer visiting, so the setup preview animates through the actual engine transitions (respects `prefers-reduced-motion`).
- `preview-card.dom.test.tsx` — jsdom test asserting `PreviewCard` renders each view kind (dots/plant/cup/flame/chance-wheel/chance-scratch/points), name/reward fallback placeholders, win/lose popups, and the card-burst celebration overlay.
- `preview-card.tsx` — `PreviewCard` client component; a static-height snapshot of the customer card view (mirrors `ProgramCardStatus`'s view-kind switch) with an optional celebration burst and a transient win/lose popup for chance types.
- `preview-state.ts` — exports `buildPreviewProgram()`, `buildInitialCard()` (mirrors `enroll_card`'s head-start seed math), and `buildPreviewProgress()`; assembles a synthetic program/card from the form's current field values and runs them through the real `getProgress()`.
- `schedule-retirement-form.dom.test.tsx` — jsdom test asserting `ScheduleRetirementForm` renders a successor picker (defaulting to the first successor) and date input, and submits the program id, chosen successor, and date.
- `schedule-retirement-form.tsx` — `ScheduleRetirementForm` client component; a successor `<Select>` plus a date input, submitted via `useActionState(scheduleRetirementAction)`.
- `setup-form.dom.test.tsx` — jsdom test covering the live preview updating on keystroke/head-start toggle, submitted field values, the flat six/eight-type picker grid, type-switch resetting name/reward, and per-variant (Flame/Points/Cup/Sprout) type/variant/label submission behavior.
- `setup-form.tsx` — `SetupForm` client component; the full create/edit/migrate/prep form (type picker, basics, chance-segment editor, head-start and carry-over toggles, expiry) driving both submission (via `useActionState`) and the live `PreviewCard`/`usePreviewAnimation` preview.

## Parent

[app](../README.md)
