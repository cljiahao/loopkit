# login

## Purpose

Vendor sign-in/sign-up route entry — the actual UI lives in
`@/features/auth`.

## Contents

- `page.tsx` — `LoginPage`: thin route entry that wraps `LoginForm` (from
  `@/features/auth`) in a `Suspense` boundary, needed because the form reads
  `useSearchParams()` (`?mode=signup`)

## Parent

[app](../README.md)
