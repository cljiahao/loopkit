# auth

## Purpose

Route group for the Supabase auth handoff; holds only the OAuth/email/
recovery callback handler.

## Contents

- `callback/` (subfolder)

## Connectivity

`callback/` is the sole route here — the landing point for Supabase's
redirect after Google OAuth sign-in, email confirmation, or a password-
recovery link, which it then forwards to `/dashboard`, `/reset-password`, or
`/login?error=oauth`.

## Parent

[app](../README.md)
