# app

## Purpose

App Router root for loopkit — global layout, fonts, and theme; root error/404
boundaries; the landing page; and the top-level route groups for the vendor,
customer, and admin surfaces.

## Contents

- `actions/`
- `admin/`
- `api/`
- `apple-icon.tsx` — 180×180 Apple touch icon, generated at request time via `next/og`'s `ImageResponse` from `@/lib/brand-icon`'s shared mark — no static asset
- `auth/`
- `c/`
- `dashboard/`
- `earn/`
- `error.tsx` — client root error boundary; replaces Next's error overlay in production with a retry UI, logs the error to the console
- `global-error.dom.test.tsx` — jsdom tests for `GlobalError`: renders the heading/message/"Try again" button with the theme's hand-converted hex fallbacks, and calls `reset()` on click
- `global-error.tsx` — client root error boundary rendered only when the root layout itself throws; ships its own `<html>`/`<body>` with inline styles since the global stylesheet may not have loaded
- `globals.css` — Tailwind v4 theme ("Raspberry-Rose Punch & Gold", replacing the earlier "Mulberry & Gold" — verified color-psychology research found brightness/saturation, not hue family, drive whether a color reads as "rewarding" vs. "moody," so the brand hue moved from magenta-plum (~350°) to a brighter, more saturated raspberry-red (~15°) while staying clear of qkit's ember hue range): light/dark CSS custom properties, `stamp-pop`/`card-burst`/`scratch-stroke-sweep` keyframe animations, reduced-motion overrides; the body's ambient two-glow gradient has its own dark-mode pass instead of reusing the light-mode oklch values, which barely read against a dark canvas
- `icon.tsx` — 32×32 favicon (`image/png`), the same generated mark at favicon size, replacing the old hand-drawn `icon.svg`
- `layout.tsx` — `RootLayout`: loads Google fonts (Bricolage Grotesque, Plus Jakarta Sans, IBM Plex Mono), sets page metadata, wraps children in `<Providers>`
- `login/`
- `not-found.tsx` — branded 404 page, e.g. for a stale or mistyped customer card link
- `page.tsx` — `Home`: landing page composing Nav/Hero/HowItWorks/Benefits/Cta/Footer, checks the Supabase session to toggle authed CTAs
- `reset-password/`
- `setup/`

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
