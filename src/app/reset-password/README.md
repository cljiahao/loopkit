# reset-password

## Purpose

Password-reset landing page, reached after the Supabase recovery-session
callback.

## Contents

- `page.tsx` — `ResetPasswordPage` client component: form to set a new password on the active recovery session via `supabase.auth.updateUser`, then redirects to `/dashboard`

## Parent

[app](../README.md)
