# auth

## Purpose

Authentication: login (Google OAuth, email/password, unverified name+phone
onboarding), the shared `requireVendor` guard used across dashboard/setup,
and password reset.

## Contents

- `api/`
- `components/`
- `index.ts` — barrel re-exporting `requireVendor`, `vendorPhoneOnboardAction`,
  `LoginForm`, `ResetPasswordForm`

## Connectivity

`index.ts` is the only path external code should import from — dashboard/setup
pages import `requireVendor` through it, and `src/app/login/` and
`src/app/reset-password/` import their form components through it. `api/`
and `components/` are private internals, not meant to be imported directly
from outside this folder: they're consumed by `index.ts` and by each other
(`components/login-form.tsx` imports `vendorPhoneOnboardAction` straight
from `../api/actions`, and `api/actions.ts` calls `requireVendor` from
`./require-vendor`).

## Parent

[features](../README.md)
