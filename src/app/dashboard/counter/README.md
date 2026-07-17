# counter

## Purpose

Standalone "serve a customer at the counter" view at `/dashboard/counter?p=<id>&phone=<optional>` — a focused single-program screen for stamping/redeeming without the full dashboard chrome.

## Contents

- `counter-page.dom.test.tsx` — jsdom test asserting `CounterPage` renders the back button, program header, and phone pre-fill; redirects to `/dashboard` when `?p=` is missing or doesn't match any program; and remounts `ServeCustomer` (via a `key`) when the resolved program changes so a stale phone pre-fill doesn't linger.
- `page.tsx` — `CounterPage` server component; requires a vendor, resolves the program from `?p=`, redirects to `/dashboard` if missing/invalid, and renders the program header plus `ServeCustomer` keyed on the program id.

## Parent

[dashboard](../README.md)
