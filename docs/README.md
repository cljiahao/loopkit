# docs

## Purpose

Non-code documentation: the project's non-negotiable architecture
invariants, the Supabase/Vercel/merqo deploy runbook, and the full
spec/plan development history.

## Contents

- `CONSTITUTION.md` — non-negotiable architecture invariants for loopkit (Supabase/RLS divergence from stock templateCentral, schema ownership, etc.); overrides `AGENTS.md`/skills on conflict, changes require an explicit Human Approval Override in the PR
- `DEPLOY.md` — deploy & attach runbook: apply migrations to the shared Supabase project (A), deploy to Vercel (B), attach to merqo (C)
- `superpowers/`

## Parent

[loopkit](../README.md)
