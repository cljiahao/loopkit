# db

## Purpose

Vitest "schema drift" guards: each file regex-checks one `supabase/migrations/`
file's raw SQL text for the columns/constraints/functions it's expected to
define. A cheap guard against silently editing a migration's intent, not a
substitute for running the migration against real Postgres.

## Contents

- `admin-schema.test.ts` — checks migration `0003_loopkit_admin.sql` (admins table + `is_admin`)
- `card-lifecycle-schema.test.ts` — checks migration `0012_loopkit_card_lifecycle.sql` (expiry + card regeneration)
- `card-token-schema.test.ts` — checks migration `0006_loopkit_card_token.sql` (`card_token` column + enroll/read functions)
- `carry-over-schema.test.ts` — checks migration `0018_loopkit_carry_over.sql` (`carry_over_stamps` column)
- `chance-types-schema.test.ts` — checks migration `0010_loopkit_chance_types.sql` (wheel/scratch `type` constraint widening)
- `engine-schema.test.ts` — checks migration `0004_loopkit_engine.sql` (`programs.type`/`config`, `cards.state` columns)
- `enroll-phone-guard-schema.test.ts` — checks migration `0009_loopkit_enroll_phone_guard.sql` (malformed-phone rejection in `enroll_card`)
- `hardening-schema.test.ts` — checks migration `0008_loopkit_hardening.sql` (stamp-progress read fix, free/Pro limit, active-only enroll)
- `head-start-percent-schema.test.ts` — checks migration `0024_loopkit_head_start_percent.sql` (`head_start_percent` column)
- `head-start-schema.test.ts` — checks migration `0014_loopkit_head_start.sql` (`head_start` column)
- `multiprogram-schema.test.ts` — checks migration `0007_loopkit_multiprogram.sql` (drops one-program-per-vendor constraint, adds `vendor_pro`)
- `points-per-visit-schema.test.ts` — checks migration `0026_loopkit_points_per_visit.sql` (`points_per_visit` config, widened `stamps_required` range)
- `program-replacement-schema.test.ts` — checks migration `0016_loopkit_program_replacement.sql` (`replaced_by` self-reference)
- `record-visit-schema.test.ts` — checks migration `0005_loopkit_record_visit.sql` (`record_visit` SECURITY DEFINER function)
- `remove-streak-type-schema.test.ts` — checks migration `0025_loopkit_remove_streak_type.sql` (streak type removed from the constraint + `enroll_card`)
- `schema.test.ts` — checks migration `0001_loopkit_core.sql` (base `programs`/`cards`/`stamp_events` schema)
- `stamp-cap.test.ts` — checks migration `0002_loopkit_stamp_cap.sql` (stamp ceiling at `stamps_required`)
- `streak-type-schema.test.ts` — checks migration `0011_loopkit_streak_type.sql` (streak `type` constraint widening)
- `vendor-join-schema.test.ts` — checks migration `0015_loopkit_vendor_join.sql` (`vendor_active_programs` public read function)
- `vendor-profile-schema.test.ts` — checks migration `0017_loopkit_vendor_profile.sql` (`loopkit.vendors` table)

## Parent

[test](../README.md)
