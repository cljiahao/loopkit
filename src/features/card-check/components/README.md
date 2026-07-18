# components

## Purpose

Client-side card-check UI.

## Contents

- `check-form.tsx` — `CheckForm`: phone-entry form using `useActionState` +
  `checkStatusAction`, renders a `ProgramCardStatus` per returned card, and
  shows a `role="alert"` message on an `"error"`/`"none"` result
- `check-form.dom.test.tsx` — jsdom tests for `CheckForm`: renders the phone
  input and hidden vendor field, submits the form and renders one
  `ProgramCardStatus` per returned card, and shows the `role="alert"`
  message for both the error and not-found results
- `program-card-status.tsx` — `ProgramCardStatus`: renders one program's
  progress visual by `view.kind`/`view.variant` (`Plant`/`Cup`,
  `FlameLayers`, `Wheel`/`ScratchCard`, `StampDots`/`PointsBar`), and owns
  its own dialog state for card regeneration (`regenerateCardAction`) and a
  one-time retired-card notice (auto-opens once per replaced card, tracked
  in `localStorage`)
- `program-card-status.dom.test.tsx` — jsdom tests for `ProgramCardStatus`:
  verifies `PointsBar` vs `StampDots` renders per `view.variant` on a
  `"dots"` view, and `Cup` vs `Plant` renders per `view.variant` on a
  `"plant"` view

## Parent

[card-check](../README.md)
