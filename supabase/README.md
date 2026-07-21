# supabase

## Purpose

SQL schema (RLS-enforced authorization) and manually-run seed data for the
`loopkit` schema in the shared Merqo Supabase project.

## Contents

- `migrations/` — SQL schema and RLS policies
- `seed/` — manually-run seed data
- `tests/` — pgTAP RLS test suite (vendors, upgrade_requests, feedback); run via `supabase test db`

## Parent

[loopkit](../README.md)
