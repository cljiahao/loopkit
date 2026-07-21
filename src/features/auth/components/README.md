# components

## Purpose

Client-side auth UI.

## Contents

- `login-form.tsx` — `LoginForm`: `ElevatedCard`-wrapped Google OAuth
  sign-in, a name+phone onboarding form (establishes an anonymous Supabase
  session then calls `vendorPhoneOnboardAction`), and email/password
  sign-in/sign-up with a "check your email" state for signup confirmation
  and password-reset links
- `reset-password-form.tsx` — `ResetPasswordForm`: `ElevatedCard`-wrapped
  password + confirm-password form on an active recovery session, calls
  `supabase.auth.updateUser` then redirects to `/dashboard`

## Parent

[auth](../README.md)
