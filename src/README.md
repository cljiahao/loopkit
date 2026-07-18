# src

## Purpose

Application source root for loopkit — the Next.js App Router tree, domain
logic/Supabase clients, shared UI components, shared hooks, and the request
middleware.

## Contents

- `app/`
- `components/`
- `features/`
- `hooks/`
- `lib/`
- `proxy.ts` — Next 16 middleware entry point (`proxy` export, matcher excludes `_next/static`/`_next/image`/`favicon.ico`/image assets); delegates to `updateSession` in `lib/supabase/middleware.ts`

## Connectivity

`app/` is the App Router surface (pages, layouts, route handlers, Server
Actions) that composes everything else in this tree: it imports domain
logic and Supabase access from `lib/`, shared visual components from
`components/`, and shared client-side behavior from `hooks/`. `proxy.ts` is
the one file outside `app/` that Next.js itself invokes directly — on every
matched request it refreshes the Supabase session and redirects
unauthenticated `/dashboard` and `/setup` requests to `/login`, before any
`app/` route handler runs.

## Parent

[loopkit](../README.md)
