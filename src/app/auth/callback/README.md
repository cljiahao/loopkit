# callback

## Purpose

Supabase auth callback route — exchanges an OAuth/magic-link code for a
session and redirects the browser onward.

## Contents

- `route.ts` — `GET` handler: exchanges the `code` query param for a Supabase session via `exchangeCodeForSession`, then redirects to a same-origin `next` param (defaulting to `/dashboard`) or to `/login?error=oauth` on failure or a missing code

## Parent

[auth](../README.md)
