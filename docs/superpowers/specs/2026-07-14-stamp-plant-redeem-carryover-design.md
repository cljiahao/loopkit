# Stamp + Plant redeem-carryover

Date: 2026-07-14

## Problem

Today, `add_stamp` (SQL RPC, `supabase/migrations/0002_loopkit_stamp_cap.sql`)
caps a stamp card's `stamp_count` at `stamps_required` — once a card is
"full" (reward ready), further stamps silently no-op until the customer
redeems. `redeem` (`0001_loopkit_core.sql`) then hard-resets `stamp_count` to 0. The Plant program type has the same shape of cap, in a different layer:
`plant.ts`'s `apply()` clamps `growth` at the bloom threshold via
`Math.min(...)`, and its `redeem()` hard-resets `growth` to 0.

User feedback: a customer who has a reward ready but hasn't claimed it yet
should be able to keep earning past the threshold, and redeeming should only
ever consume exactly what the reward costs — any excess carries over toward
their next cycle, rather than being discarded.

This is a narrowly-scoped fix (Spec C of the original three-spec sequence
brainstormed this session: A — header nav + vendor-level Activity/Stats,
shipped; B — Counter page + universal QR scan, shipped; C — this spec). A
related, much larger idea surfaced during brainstorming — a separate
reward-voucher ledger with per-reward expiry dates, automatic redemption for
non-points-based rewards, and a points-based reward mechanic — was
deliberately deferred to its own future spec, not folded in here. See Out of
scope below.

## Decisions (from brainstorming)

- Scope: Stamp and Plant only. Streak is already uncapped
  (`current_streak` keeps incrementing past `target_streak` once banked),
  but its `redeem()` is a full logical reset — a streak count isn't a
  bankable surplus the way stamps/growth are, so "carryover" doesn't map
  cleanly. Left as today's behavior. Wheel/Scratch (chance types) have no
  accumulation or redeem concept at all — each play resolves instantly — so
  they're naturally out of scope, not a choice.
- No reward-stacking: each redeem call grants exactly one reward
  (`reward_count`/`blooms` +1), consumes exactly one threshold's worth, and
  carries the rest forward. If the leftover still meets the threshold, the
  vendor can redeem again immediately — that's consecutive redemptions, not
  stacking from one call.
- Redeem confirmation copy updates to describe carryover accurately instead
  of implying a full reset (see section C).

## A. Stamp (SQL — new migration)

New file `supabase/migrations/0022_loopkit_stamp_carryover.sql`, replacing
both function bodies (same signatures, `create or replace`):

- `add_stamp(p_program uuid, p_phone text)`: remove the ceiling condition
  entirely. The "existing card" branch becomes an unconditional
  `stamp_count = stamp_count + 1`, always logs a `stamp` event — no more
  "already at ceiling, no-op, no audit row" branch.
- `redeem(p_card uuid)`: look up `stamps_required` via the card's
  `program_id` (join to `loopkit.programs`), then
  `stamp_count = greatest(stamp_count - v_required, 0)` instead of
  `stamp_count = 0`. `reward_count = reward_count + 1` unchanged.

Migration is hand-applied by the user via the Supabase dashboard SQL Editor,
same as every prior migration this session — no linked Supabase CLI in this
environment.

## B. Plant (`src/lib/engine/plant.ts`)

- `apply(event, state, config, now)`: remove the bloom cap —
  `growth = settled + config.growth_per_visit` (was
  `Math.min(settled + config.growth_per_visit, bloom)`). `bloomed` and
  `rewardUnlocked` logic (crossing the threshold) is unchanged — both
  already compare against `bloom`, independent of whether growth is capped.
- `redeem(state, config)`: change signature to actually use `config` (the
  `Strategy` interface already declares `redeem(state: S, config: C): S` —
  `plant.ts` was just ignoring the second parameter). Carry over:
  `growth: Math.max(0, state.growth - bloomThreshold(config))` instead of
  `growth: 0`. `blooms: state.blooms + 1` unchanged.

No display changes needed: `/c`'s `StampDots` view already clamps `filled`
at `total` via `Math.min` (`stamp.ts`'s `progress()`), and Plant's
`stageIndexFor` already clamps at the last stage — both render correctly
off an uncapped underlying count without modification. The vendor-facing
stamp counter in `serve-customer.tsx` (`{stamp_count} / {stampsRequired}`)
already shows the raw count, so an over-threshold value (e.g. "11 / 8
stamps") displays as-is, which is the desired behavior.

## C. Redeem confirmation copy

- `src/app/dashboard/redeem-button.tsx`: add a `stampsRequired: number`
  prop (the caller, `ServeCustomer`, already has this value in scope — see
  `serve-customer.tsx`'s existing `stampsRequired` prop). Change the
  `AlertDialogDescription` from "Redeem reward for {card.phone}? This
  resets their card." to "Redeem reward for {card.phone}? Uses
  {stampsRequired} stamps — any extra carries over to their next card."
- `src/app/dashboard/serve-customer.tsx`'s Plant `AlertDialogDescription`:
  change "Redeem {rewardText} for {result.phone}? This resets their plant
  to a seed." to "Redeem {rewardText} for {result.phone}? Any extra growth
  carries over to their next plant." (no exact number stated here — Plant's
  bloom threshold lives in `program.config.stages`, not guaranteed
  identical to the generic `stampsRequired` field passed into
  `ServeCustomer`, so the copy stays qualitative rather than risking a
  wrong number).

## D. Testing

- `test/lib/engine/plant.test.ts`: extend for (1) `apply()` growth
  exceeding the bloom threshold across repeated visits past bloom, and (2)
  `redeem()` carrying over `growth - bloomThreshold` instead of resetting
  to 0, including the boundary case where growth exactly equals the
  threshold (carryover of exactly 0).
- `redeem-button.tsx`'s copy change: extend or add a
  `redeem-button.dom.test.tsx` asserting the new confirmation text renders
  with the passed `stampsRequired` value.
- `serve-customer.tsx`'s Plant copy change: extend
  `test/app/serve-customer.test.tsx`'s existing Plant redeem-dialog
  coverage (if any) for the new text; add if none exists.
- SQL migration: no automated test, matching the existing convention for
  every prior migration in this repo (RPC bodies are hand-verified against
  the SQL, not integration-tested).

## Out of scope

- Streak and Wheel/Scratch carryover (see Decisions).
- The reward-voucher ledger (earned_at + expiry_date), automatic redemption
  for non-points-based rewards, and points-based rewards as a mechanic —
  a separate, larger initiative surfaced during brainstorming, deliberately
  deferred to its own future spec rather than folded into this one.
- Any change to `record_visit`, `enroll_card`, `vendor_join`, or the
  program-replacement carry-over feature from `0018_loopkit_carry_over.sql`
  (a same-named but unrelated feature — that migration carries a card's
  progress across a vendor _replacing_ one program with another; this spec
  is about a single card's progress surviving its own redeem).

## Cleanup

Per standing project convention: this change replaces `add_stamp`/`redeem`
function bodies and `plant.ts`'s `apply`/`redeem` outright — no old
capped/reset code paths are left behind, dead, or gated behind a flag. The
old confirmation copy strings are replaced, not duplicated alongside new
ones.
