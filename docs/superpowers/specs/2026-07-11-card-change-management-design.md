# Card-type change management — stamp carryover + customer notification

Date: 2026-07-11

## Problem

The loyalty-templates-and-migration spec (`2026-07-11-loyalty-templates-and-migration-design.md`)
shipped `changeTypeAction` (`src/app/setup/actions.ts:124-199`) yesterday: a
vendor can retire a program and stand up its replacement, and a retired
card's `replaced_by` links to the new one. But that spec explicitly scoped
out the two things a vendor doing this in anger actually needs:

> No stamp-count carryover — new program starts every customer at 0.
> No proactive notification (SMS/push) to customers when a program is
> retired — the message is surface-level, shown next time the customer
> opens their `/c` page themselves.

The user now wants both closed: "we need to do some change management for
the customers to let them know its a new loyalty card series. Either we
allow vendors to do migration of old to new with the same number of stamps
or something else."

## What does NOT change

- `changeTypeAction`'s deactivate → create → link sequence and its
  non-transactional failure handling (`src/app/setup/actions.ts:124-199`).
- A program's `type` stays immutable in place — carryover happens by
  seeding the _new_ card's progress at enrollment time, never by mutating
  an existing card's `program_id`.
- `vendor_join`'s enrollment loop and `replaced_by_name` projection
  (migration `0016`).
- The engine `Strategy` layer (`src/lib/engine/*`) and every program type's
  `config`/`state` shape.

## What changes

### A. Stamp carryover — scoped to same-type migrations only

`loopkit.cards` has one universal progress field, `stamp_count`
(`0001_loopkit_core.sql:17`), but what it _means_ differs per engine type:
for `stamp` it's literally "stamps collected." For `lucky`/`wheel`/`scratch`
it's a pity-ceiling counter. For `plant`/`streak` the real progress lives in
`state` jsonb (growth stage / streak length), not `stamp_count` at all.
Copying a raw `stamp_count` across a type change (e.g. stamp→streak) isn't
"the same number of stamps" — it's a meaningless number landing in the
wrong field. The user's own phrasing — "the same number of stamps" — only
has a literal meaning for `stamp`→`stamp` migrations, so that's the only
case this spec carries progress over. A type change that also changes
`type` (stamp→plant, wheel→streak, etc.) always resets to zero, same as
today — extending carryover to cross-type progress translation is a
separate, much larger design problem (out of scope, see below).

**Carryover is vendor-chosen, not automatic** — recommended over
always-on or never, because a vendor might legitimately want either a clean
slate (e.g. "old card was being abused, restart everyone") or continuity
(e.g. "just renaming/retuning the same program"), and only the vendor
knows which. Concretely:

`supabase/migrations/0017_loopkit_carry_over.sql` (new):

```sql
alter table loopkit.programs
  add column carry_over_stamps boolean not null default false;

-- create_program: accept an optional carry-over flag, defaulted so every
-- existing call site (saveProgramAction's create path) is unaffected.
create or replace function loopkit.create_program(
  p_type              text,
  p_name              text,
  p_stamps_required   int,
  p_reward_text       text,
  p_config            jsonb,
  p_expiry_days       int default null,
  p_head_start        boolean default false,
  p_carry_over_stamps boolean default false
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not authorized';
  end if;
  if not (
    loopkit.is_pro(v_uid)
    or (select count(*) from loopkit.programs where vendor_id = v_uid and active) < 1
  ) then
    raise insufficient_privilege;
  end if;
  insert into loopkit.programs
    (vendor_id, type, name, stamps_required, reward_text, config, expiry_days,
     head_start, carry_over_stamps)
    values (v_uid, p_type, p_name, p_stamps_required, p_reward_text, p_config,
            p_expiry_days, p_head_start, p_carry_over_stamps)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function loopkit.create_program(
  text, text, int, text, jsonb, int, boolean, boolean
) to authenticated;

-- enroll_card: on first enrollment into a program that (a) opted into
-- carryover and (b) has a same-type predecessor (this program is the
-- target of some other program's replaced_by), seed stamp_count from that
-- predecessor's card for the same phone, capped at the new requirement.
-- Precedence: carry-over seeding wins over head_start seeding if a program
-- somehow has both set — a vendor-chosen carryover is a stronger signal
-- than the generic head-start default, and the two are not expected to be
-- combined in the UI (Section B only offers the checkbox on migration,
-- head_start is only offered on first-time creation).
create or replace function loopkit.enroll_card(p_program uuid, p_phone text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_token text;
  v_program loopkit.programs%rowtype;
  v_predecessor loopkit.programs%rowtype;
  v_seed_stamp_count int := 0;
  v_seed_state jsonb := '{}'::jsonb;
  v_seed int;
begin
  if p_phone !~ '^\+65[3689][0-9]{7}$' then
    return null;
  end if;

  select * into v_program from loopkit.programs where id = p_program and active;
  if not found then
    return null;
  end if;

  if v_program.carry_over_stamps then
    select p.* into v_predecessor
      from loopkit.programs p
      where p.replaced_by = v_program.id
      limit 1;
    if found and v_predecessor.type = 'stamp' and v_program.type = 'stamp' then
      select coalesce(c.stamp_count, 0) into v_seed_stamp_count
        from loopkit.cards c
        where c.program_id = v_predecessor.id and c.phone = p_phone;
      v_seed_stamp_count := least(coalesce(v_seed_stamp_count, 0), v_program.stamps_required);
    end if;
  elsif v_program.head_start then
    -- existing head_start seeding, unchanged (0014_loopkit_head_start.sql:85-…)
    v_seed := greatest(1, round(v_program.stamps_required * 0.2)::int);
    if v_program.type = 'stamp' then
      v_seed_stamp_count := least(v_seed, v_program.stamps_required - 1);
    end if;
    -- (plant/other-type head_start branches carried over verbatim from 0014)
  end if;

  insert into loopkit.cards (program_id, phone, stamp_count, state)
    values (p_program, p_phone, v_seed_stamp_count, v_seed_state)
  on conflict (program_id, phone) do nothing;

  select card_token into v_token
    from loopkit.cards
    where program_id = p_program and phone = p_phone;
  return v_token;
end;
$$;

grant execute on function loopkit.enroll_card(uuid, text) to anon, authenticated, service_role;
```

`src/lib/types.ts`: `programs` Row/Insert/Update gain `carry_over_stamps:
boolean`. `src/lib/program.ts`: `Program` type gains `carry_over_stamps:
boolean`, `PROGRAM_COLUMNS` gains it (needed so `/setup` can decide whether
to show the checkbox based on the _predecessor's_ type, not the new one).

### B. `/setup?migrate=` UI — carryover checkbox

`SetupForm` (`src/app/setup/setup-form.tsx`), migrate mode only: when the
program being replaced (`replacingId`'s program, already loaded by
`/setup/page.tsx` as `migrating`) has `type === "stamp"` **and** the
vendor's current type-picker selection is also `stamp` (template or Custom,
doesn't matter — only the resulting type matters), show a checkbox:

> ☐ Carry over customers' current stamp count onto the new card

Unchecked by default (safer default — a vendor who doesn't tick it gets
today's behavior exactly). If the vendor picks a non-stamp template/type,
the checkbox is hidden entirely (server action ignores any stray
`carry_over_stamps` field when types don't match — belt-and-suspenders,
the RPC already no-ops this case via the type check in Section A).

`changeTypeAction` (`src/app/setup/actions.ts`) reads
`formData.get("carry_over_stamps") === "true"` and passes it as
`p_carry_over_stamps` to the `create_program` call.

### C. Customer notification — strengthen the passive model (v1)

Proactive push (SMS at the moment of migration) needs an SMS provider
wired up — that's real infra (Twilio/SNS account, per-message cost,
delivery failure handling) that doesn't exist anywhere in loopkit today.
The phone-OTP onboarding spec (sub-project B in this batch) is evaluating
the same kind of provider for vendor auth; **if B ships an SMS provider,
this spec's proactive-notify piece should reuse it rather than the two
specs picking different vendors independently** — that's a sequencing
dependency, not a technical blocker, and is called out as an open question
below rather than assumed.

Absent that, v1 upgrades the existing pull-based notice
(`src/app/c/program-card-status.tsx:107-113`) from an easy-to-miss line of
muted text at the bottom of the card to something a customer can't scroll
past without seeing:

- `CardStatus.replacedByName` (already wired end-to-end since yesterday's
  spec) drives a dismissible `AlertDialog` that auto-opens once per card
  the first time a customer with a retired, unredeemed card loads `/c`.
  "Seen" state persists in `localStorage` (`loopkit:seen-replaced:<programId>`)
  — same trust model as the rest of `/c`'s customer-side state (no server
  round-trip needed to remember a dismissal, consistent with
  `regenerateCardAction`'s existing local-only UX patterns).
- Dialog copy: "**[Old program name] has a new card: [replaced_by_name]**.
  Your old rewards are still yours to redeem — show the shop this card.
  Next time you check in, you'll get the new card automatically." (Copy
  adapts if `carry_over_stamps` carried progress forward — surfaced via a
  new `CardStatus.carriedOverCount: number | null` field, sourced the same
  way `replaced_by_name` is today: extend `vendor_join`'s projection to
  also return the _new_ card's `stamp_count` when `replaced_by` is set, so
  the dialog can say "...with your 6 stamps carried over.")
- The existing small-text line stays as a permanent, non-dismissible
  fallback on the card itself (for a returning customer past the one-time
  dialog).

This is strictly additive to migration `0016`'s existing
`replaced_by_name` plumbing — no new RPC, just widening `vendor_join`'s
`select` list once more (same DROP-then-CREATE-OR-REPLACE pattern as
`0016`, since adding a return column changes the signature).

## Testing

- `test/db/carry-over-schema.test.ts` (new) — regex-match
  `0017_loopkit_carry_over.sql`: `carry_over_stamps` column,
  `create_program`'s new default-`false` parameter, `enroll_card`'s
  predecessor lookup and same-type guard.
- `test/app/change-type-action.test.ts` — extend: checkbox value flows
  into `p_carry_over_stamps`; a non-stamp target type never sends
  `carry_over_stamps: true` regardless of submitted form data.
- `test/app/check-status-action.test.ts` — extend: `carriedOverCount`
  flows from `vendor_join`'s new column onto `CardStatus` when present,
  stays `null` otherwise.
- `test/lib/program.test.ts` — `PROGRAM_COLUMNS`/`Program` type include
  `carry_over_stamps`.
- No new test for the dialog's `localStorage` dismissal logic beyond a
  component-level smoke test — matches this codebase's existing testing
  depth for `/c`'s other local-only UI state (`regenOpen` etc. aren't
  unit-tested either).

## Out of scope

- Cross-type progress carryover (stamp→plant, wheel→streak, etc.) — no
  general translation exists between engine-specific `state` shapes;
  needs its own design if ever requested.
- Proactive SMS/push notification — needs an SMS provider decision,
  deferred pending sub-project B (see Open Questions).
- Any change to `head_start`'s existing seeding behavior for first-time
  program creation — carryover only applies on migration-created programs.
- Partial/proportional carryover (e.g. scaling 6/10 stamps to a new
  20-stamp requirement) — v1 is a straight capped copy; proportional
  scaling is a vendor-facing complexity not requested.

## Open questions for Clarence

1. **Carryover default/scope** — confirm same-type-only, vendor-opt-in-checkbox
   (Section A/B) matches what you meant by "the same number of stamps or
   something else." If you actually want carryover attempted across
   different types too (e.g. approximate a stamp count into a plant's
   growth stage), that's a materially bigger design — say so before I plan
   it as scoped here.
2. **Notification approach** — v1 here is a strengthened _passive_ dialog
   (Section C), not proactive SMS. Confirm that's an acceptable v1, or
   that proactive SMS is a hard requirement now (in which case this spec
   should be sequenced _after_ sub-project B's SMS-provider decision, not
   parallel to it).
3. **`carriedOverCount` copy** — confirm showing the exact carried-over
   stamp count in the notice dialog is wanted, versus a vaguer "your
   progress carried over" (exact numbers are more reassuring but also more
   surface area if the seeding logic ever has an edge case).
