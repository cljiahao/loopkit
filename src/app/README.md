# app

## Purpose

App Router root for loopkit — global layout, fonts, and theme; root error/404
boundaries; the landing page; and the top-level route groups for the vendor,
customer, and admin surfaces.

## Contents

- `admin/` (subfolder)
- `api/` (subfolder)
- `auth/` (subfolder)
- `c/` (subfolder)
- `dashboard/` (subfolder)
- `earn/` (subfolder)
- `error.tsx` — client root error boundary; replaces Next's error overlay in production with a retry UI, logs the error to the console
- `global-error.tsx` — client root error boundary rendered only when the root layout itself throws; ships its own `<html>`/`<body>` with inline styles since the global stylesheet may not have loaded
- `globals.css` — Tailwind v4 theme ("Mulberry & Gold"): light/dark CSS custom properties, `stamp-pop`/card-burst keyframe animations, reduced-motion overrides
- `icon.svg` — static favicon asset
- `layout.tsx` — `RootLayout`: loads Google fonts (Bricolage Grotesque, Plus Jakarta Sans, IBM Plex Mono), sets page metadata, wraps children in `<Providers>`
- `login/` (subfolder)
- `not-found.tsx` — branded 404 page, e.g. for a stale or mistyped customer card link
- `page.tsx` — `Home`: landing page composing Nav/Hero/HowItWorks/Benefits/Cta/Footer, checks the Supabase session to toggle authed CTAs
- `reset-password/` (subfolder)
- `setup/` (subfolder)

## Connectivity

`admin/` hosts the Merqo-team console; `dashboard/` is the vendor console;
`c/` and `earn/` are unauthenticated, customer-facing flows reached via QR
code or link. `login/`, `auth/`, `reset-password/`, and `setup/` form the
authentication chain: `login/` starts a session (email/password, Google
OAuth, or phone onboarding), `auth/callback` completes an OAuth or recovery
handoff and forwards to `reset-password/` or `dashboard/`, and `setup/`
handles authenticated vendor onboarding. `api/` exposes route handlers
consumed by the merqo parent app over HTTP. The root-level files
(`layout.tsx`, `globals.css`, `error.tsx`, `global-error.tsx`,
`not-found.tsx`) provide the shared shell, theme, and error/404 boundaries
every route in this tree inherits.

## Parent

[src](../README.md)
