# migrations

## Purpose

SQL schema + RLS migration chain for the `loopkit` schema in the shared
Merqo Supabase project, applied in order. Convention: each file opens with a
comment describing its purpose; changes are additive/idempotent (`create or
replace`, `add column`) unless a file's own header explains a deliberate
exception.

## Contents

- `0001_loopkit_core.sql` — creates the `loopkit` schema and the base `programs`/`cards`/`stamp_events` tables, RLS, and the `owns_program`/`add_stamp`/`redeem`/`card_status` functions + grants
- `0002_loopkit_stamp_cap.sql` — caps stamping at the program's `stamps_required` (a full card stays full) and exposes the shop name
- `0003_loopkit_admin.sql` — platform-operator admin: an internal allow-list of admins (`is_admin`) and an audit trail of their actions
- `0004_loopkit_engine.sql` — v2 engine phase 1: generalizes the schema so a program has a `type` + `config` blob, a card carries a `state` blob, and events carry a `payload`
- `0005_loopkit_record_visit.sql` — generic engine write path (`record_visit`): persists a TypeScript-computed card state + logs one event, for non-stamp types
- `0006_loopkit_card_token.sql` — gives every card an opaque `card_token` (the QR payload) and three SECURITY DEFINER read/enroll functions for the public `/c` page
- `0007_loopkit_multiprogram.sql` — lets a vendor own many programs (free = 1 active, Pro = unlimited); drops the one-program-per-vendor unique constraint, adds `vendor_pro`
- `0008_loopkit_hardening.sql` — v2 hardening: fixes a stamp-progress read gap, enforces the free/Pro program limit in the database, only enrolls into active programs, drops the redundant public `card_status` surface
- `0009_loopkit_enroll_phone_guard.sql` — rejects malformed phone strings inside `enroll_card` itself, hardening the anonymous enroll surface against direct calls
- `0010_loopkit_chance_types.sql` — widens `programs.type` to admit the wheel/scratch chance-based templates
- `0011_loopkit_streak_type.sql` — widens `programs.type` to admit the streak template
- `0012_loopkit_card_lifecycle.sql` — card lifecycle: vendor-configurable expiry (days from cycle start) and card regeneration (reissue token + reset progress)
- `0013_loopkit_upgrade_requests.sql` — self-serve Pro upgrade requests table, reviewed by an admin on `/admin/vendors`
- `0014_loopkit_head_start.sql` — vendor opt-in "head start": pre-fills a new card with ~20% progress toward its first reward (Endowed Progress Effect)
- `0015_loopkit_vendor_join.sql` — public `vendor_active_programs` function listing a vendor's active programs for the `/c` landing preview, before a phone number is entered
- `0016_loopkit_program_replacement.sql` — adds `replaced_by` for program-type migration, and fixes the free-tier cap to count only active programs
- `0017_loopkit_vendor_profile.sql` — `loopkit.vendors`: a lazily-created row per vendor (name/phone), first written on a `/profile` save
- `0018_loopkit_carry_over.sql` — adds `carry_over_stamps` and threads it through `create_program`
- `0019_qkit_earn.sql` — `qkit_earn_config`: vendor-owned setting for which program (if any) earns a stamp from a completed qkit order, Pro-gated
- `0020_qkit_earn_functions.sql` — two SECURITY DEFINER functions (`qkit_earn_lookup`/commit) backing the anonymous `/earn` claim flow
- `0021_loopkit_customers.sql` — `loopkit.customers` table, keyed by `(vendor_id, phone)`
- `0022_loopkit_stamp_carryover.sql` — removes the stamp ceiling; `add_stamp` now increments unconditionally and carries over excess stamps on redeem
- `0023_loopkit_program_switching.sql` — tiered program switching: free-tier prep-and-activate, Pro scheduled cutover via `scheduled_deactivate_at`
- `0024_loopkit_head_start_percent.sql` — replaces the fixed ~20% head-start seed with a vendor-configurable `head_start_percent` (5–50, default 20)
- `0025_loopkit_remove_streak_type.sql` — removes the Streak Club program type entirely, replaced by Flame Club (a Stamp visual variant); no live rows existed, so this is a full removal rather than the usual additive-only convention
- `0026_loopkit_points_per_visit.sql` — Points Club: `points_per_visit` config field (default 1) instead of Stamp's implicit +1; widens the `stamps_required` range to 100,000

## Parent

[supabase](../README.md)
