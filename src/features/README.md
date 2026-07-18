# features

## Purpose

templateCentral-style feature folders — one folder per domain feature, each
owning its own `api/`/`components/` internals behind a single `index.ts`
barrel that is the sole public entry point external code should import from.

## Contents

- `auth/`
- `card-check/`

## Connectivity

`src/app/` pages compose UI and logic from `src/features/<name>/` via each
feature's `index.ts` barrel. Features do not import from each other
directly — `card-check` doesn't import from `auth`, and vice versa.

## Parent

[src](../README.md)
