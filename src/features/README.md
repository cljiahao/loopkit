# features

## Purpose

templateCentral-style feature folders — one folder per domain feature, each
owning its own `api/`/`components/` internals behind a single `index.ts`
barrel that is the sole public entry point external code should import from.

## Contents

- `auth/`

## Connectivity

`src/app/` pages compose UI and logic from `src/features/<name>/` via each
feature's `index.ts` barrel. Features do not import from each other
directly — not yet exercised with only `auth/` present, but the rule holds
once later phases add more feature folders.

## Parent

[src](../README.md)
