# login

## Purpose

Vendor sign-in/sign-up page — Google OAuth, name+phone onboarding, and
email/password auth with password-reset request.

## Contents

- `actions.ts` — `vendorPhoneOnboardAction`: `"use server"` action that upserts a vendor's name+phone against an already-established anonymous Supabase session (unverified name+phone onboarding)
- `page.tsx` — `LoginPage`/`LoginForm` client component: Google OAuth sign-in, phone-onboarding form, and email/password sign-in/sign-up with a "check your email" state for confirmation and password-reset links

## Parent

[app](../README.md)
