-- supabase/migrations/0027_loopkit_reward_vouchers.sql
-- Reward-voucher ledger: every reward earned gets a row with earned_at,
-- an optional expires_at, and redeemed_at — instead of just incrementing
-- reward_count/blooms with no history. Deferred from the
-- 2026-07-14-stamp-plant-redeem-carryover brainstorm; see
-- docs/superpowers/specs/2026-07-16-reward-voucher-ledger-design.md.

create table loopkit.reward_vouchers (
  id           uuid primary key default gen_random_uuid(),
  card_id      uuid not null references loopkit.cards(id) on delete cascade,
  program_id   uuid not null references loopkit.programs(id) on delete cascade,
  reward_text  text not null,
  earned_at    timestamptz not null default now(),
  expires_at   timestamptz,
  redeemed_at  timestamptz,
  status       text not null default 'active'
               check (status in ('active','redeemed','expired')),
  updated_at   timestamptz not null default now()
);

create index reward_vouchers_card_idx on loopkit.reward_vouchers(card_id, status);

alter table loopkit.reward_vouchers enable row level security;

create policy reward_vouchers_own on loopkit.reward_vouchers
  for select using (loopkit.owns_program(program_id));

grant select on loopkit.reward_vouchers to authenticated;
grant all on loopkit.reward_vouchers to service_role;

alter table loopkit.programs
  add column reward_expiry_days int
  check (reward_expiry_days is null or reward_expiry_days between 1 and 3650);

-- Same crossing-count logic as src/lib/engine/threshold.ts's
-- countThresholdCrossings — Stamp's mutation path is pure SQL (add_stamp),
-- so it needs its own copy of this one-line rule rather than calling TS.
create or replace function loopkit.count_threshold_crossings(
  p_prev int, p_next int, p_required int
)
returns int language sql immutable as $$
  select floor(p_next::numeric / p_required)::int - floor(p_prev::numeric / p_required)::int;
$$;

-- Flips this card's active-but-past-expiry vouchers to 'expired' and
-- returns how many were just flipped. Status-only — does NOT touch
-- stamp_count/growth; callers (add_stamp/redeem below, and Plant's TS
-- server actions) are responsible for forfeiting the corresponding
-- threshold's worth of progress using the returned count.
create or replace function loopkit.expire_stale_vouchers(p_card uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  if not loopkit.owns_program((select program_id from loopkit.cards where id = p_card)) then
    raise exception 'not authorized';
  end if;
  with expired as (
    update loopkit.reward_vouchers
      set status = 'expired', updated_at = now()
      where card_id = p_card and status = 'active'
        and expires_at is not null and expires_at < now()
      returning 1
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$$;

-- Inserts p_count new voucher rows for a card. p_immediate is for
-- instant-resolve types (Lucky/Wheel/Scratch): the reward is granted the
-- moment it's won, so the voucher is born already redeemed, no expiry.
create or replace function loopkit.grant_reward_voucher(
  p_card uuid, p_reward_text text, p_expiry_days int,
  p_count int default 1, p_immediate boolean default false
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_program_id uuid;
  i int;
begin
  select program_id into v_program_id from loopkit.cards where id = p_card;
  if v_program_id is null or not loopkit.owns_program(v_program_id) then
    raise exception 'not authorized';
  end if;
  for i in 1..p_count loop
    insert into loopkit.reward_vouchers
      (card_id, program_id, reward_text, expires_at, redeemed_at, status)
      values (
        p_card, v_program_id, p_reward_text,
        case when p_immediate or p_expiry_days is null
          then null else now() + (p_expiry_days || ' days')::interval end,
        case when p_immediate then now() else null end,
        case when p_immediate then 'redeemed' else 'active' end
      );
  end loop;
end;
$$;

-- Marks the oldest active voucher for this card redeemed. Raises
-- 'no_active_voucher' if none exist (post-expiry-sweep) — callers turn
-- this into a friendly "nothing to redeem" message rather than letting a
-- stale stamp_count alone decide a reward is claimable.
create or replace function loopkit.redeem_oldest_voucher(p_card uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not loopkit.owns_program((select program_id from loopkit.cards where id = p_card)) then
    raise exception 'not authorized';
  end if;
  select id into v_id from loopkit.reward_vouchers
    where card_id = p_card and status = 'active'
    order by earned_at asc limit 1;
  if v_id is null then
    raise exception 'no_active_voucher';
  end if;
  update loopkit.reward_vouchers
    set status = 'redeemed', redeemed_at = now(), updated_at = now()
    where id = v_id;
end;
$$;

grant execute on function loopkit.expire_stale_vouchers(uuid) to authenticated;
grant execute on function loopkit.grant_reward_voucher(uuid, text, int, int, boolean) to authenticated;
grant execute on function loopkit.redeem_oldest_voucher(uuid) to authenticated;

-- create_program: additive trailing p_reward_expiry_days, same pattern as
-- every prior additive param on this function (p_expiry_days, p_head_start, ...).
create or replace function loopkit.create_program(
  p_type               text,
  p_name               text,
  p_stamps_required    int,
  p_reward_text        text,
  p_config             jsonb,
  p_expiry_days        int default null,
  p_head_start         boolean default false,
  p_carry_over_stamps  boolean default false,
  p_active             boolean default true,
  p_head_start_percent int default 20,
  p_reward_expiry_days int default null
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
  if p_active then
    if not (
      loopkit.is_pro(v_uid)
      or (select count(*) from loopkit.programs where vendor_id = v_uid and active) < 1
    ) then
      raise insufficient_privilege;
    end if;
  else
    if not (
      loopkit.is_pro(v_uid)
      or (select count(*) from loopkit.programs where vendor_id = v_uid and replaced_by is null) < 2
    ) then
      raise insufficient_privilege;
    end if;
  end if;
  insert into loopkit.programs
    (vendor_id, type, name, stamps_required, reward_text, config, expiry_days,
     head_start, carry_over_stamps, active, head_start_percent, reward_expiry_days)
    values (v_uid, p_type, p_name, p_stamps_required, p_reward_text, p_config,
            p_expiry_days, p_head_start, p_carry_over_stamps, p_active,
            p_head_start_percent, p_reward_expiry_days)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function loopkit.create_program(
  text, text, int, text, jsonb, int, boolean, boolean, boolean, int, int
) to authenticated;

-- add_stamp: same increment-by-points_per_visit behavior as 0026, plus
-- voucher bookkeeping — sweep this card's expired vouchers (forfeiting
-- their stamps) before applying this visit's stamps, then grant a new
-- voucher for every threshold multiple this visit crosses.
create or replace function loopkit.add_stamp(p_program uuid, p_phone text)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare
  v_card loopkit.cards;
  v_card_id uuid;
  v_config jsonb;
  v_amount int;
  v_required int;
  v_reward_text text;
  v_reward_expiry_days int;
  v_expired_count int;
  v_prev int;
  v_crossings int;
begin
  if not loopkit.owns_program(p_program) then
    raise exception 'not authorized';
  end if;

  select config, stamps_required, reward_text, reward_expiry_days
    into v_config, v_required, v_reward_text, v_reward_expiry_days
    from loopkit.programs where id = p_program;
  v_amount := coalesce((v_config->>'points_per_visit')::int, 1);

  -- First stamp for this phone: create the card and log it. on conflict
  -- do nothing absorbs a race between two concurrent first-ever calls for
  -- the same phone — the loser falls through to the existing-card branch
  -- below (via the re-select by program_id+phone) instead of raising an
  -- unhandled unique_violation. Same safety net 0026 relied on.
  insert into loopkit.cards (program_id, phone, stamp_count)
    values (p_program, p_phone, v_amount)
  on conflict (program_id, phone) do nothing
  returning * into v_card;
  if v_card.id is not null then
    insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
    v_crossings := loopkit.count_threshold_crossings(0, v_amount, v_required);
    if v_crossings > 0 then
      perform loopkit.grant_reward_voucher(v_card.id, v_reward_text, v_reward_expiry_days, v_crossings, false);
    end if;
    return v_card;
  end if;

  -- Existing card (including a just-lost insert race above): sweep
  -- expired vouchers first, forfeiting their stamps, then always
  -- increment by v_amount, no ceiling.
  select id into v_card_id from loopkit.cards
    where program_id = p_program and phone = p_phone;
  v_expired_count := loopkit.expire_stale_vouchers(v_card_id);

  select stamp_count into v_prev from loopkit.cards where id = v_card_id;
  v_prev := greatest(v_prev - v_expired_count * v_required, 0);

  update loopkit.cards
    set stamp_count = v_prev + v_amount, updated_at = now()
    where id = v_card_id
  returning * into v_card;
  insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');

  v_crossings := loopkit.count_threshold_crossings(v_prev, v_card.stamp_count, v_required);
  if v_crossings > 0 then
    perform loopkit.grant_reward_voucher(v_card.id, v_reward_text, v_reward_expiry_days, v_crossings, false);
  end if;
  return v_card;
end;
$$;

-- redeem: sweep expired vouchers (forfeiting their stamps) before
-- consuming, then require an active voucher to actually redeem — a stray
-- stamp_count no longer alone decides a reward is claimable.
create or replace function loopkit.redeem(p_card uuid)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare
  v_card          loopkit.cards;
  v_required      int;
  v_expired_count int;
begin
  select * into v_card from loopkit.cards where id = p_card;
  if v_card.id is null or not loopkit.owns_program(v_card.program_id) then
    raise exception 'not authorized';
  end if;

  select stamps_required into v_required
    from loopkit.programs
    where id = v_card.program_id;

  v_expired_count := loopkit.expire_stale_vouchers(p_card);
  perform loopkit.redeem_oldest_voucher(p_card); -- raises no_active_voucher if none left

  update loopkit.cards
    set stamp_count = greatest(stamp_count - v_expired_count * v_required - v_required, 0),
        reward_count = reward_count + 1,
        updated_at = now()
    where id = p_card returning * into v_card;
  insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'redeem');
  return v_card;
end;
$$;

-- vendor_join: surface the customer's oldest active voucher's expiry (if
-- any) so /c can show "redeem within N days". Same DROP-then-CREATE-OR-
-- REPLACE requirement as prior RETURNS TABLE column additions (0016, 0018).
drop function if exists loopkit.vendor_join(uuid, text);

create or replace function loopkit.vendor_join(p_vendor uuid, p_phone text)
returns table (
  program_id uuid, name text, type text, config jsonb, state jsonb,
  stamp_count int, card_token text, reward_text text, stamps_required int,
  expiry_days int, cycle_started_at timestamptz, active boolean,
  replaced_by_name text, replaced_by_stamp_count int,
  voucher_expires_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare v_program record;
begin
  if p_phone !~ '^\+65[3689][0-9]{7}$' then
    raise exception 'invalid phone';
  end if;

  for v_program in
    select p.id from loopkit.programs p
    where p.vendor_id = p_vendor and p.active
      and not exists (
        select 1 from loopkit.cards c
        where c.program_id = p.id and c.phone = p_phone
      )
  loop
    perform loopkit.enroll_card(v_program.id, p_phone);
  end loop;

  return query
    select p.id, p.name, p.type, p.config, coalesce(c.state, '{}'::jsonb),
           coalesce(c.stamp_count, 0), c.card_token, p.reward_text,
           p.stamps_required, p.expiry_days, c.cycle_started_at, p.active,
           r.name, nc.stamp_count,
           (select min(rv.expires_at) from loopkit.reward_vouchers rv
              where rv.card_id = c.id and rv.status = 'active' and rv.expires_at is not null)
    from loopkit.cards c
    join loopkit.programs p on p.id = c.program_id
    left join loopkit.programs r on r.id = p.replaced_by
    left join loopkit.cards nc on nc.program_id = p.replaced_by and nc.phone = c.phone
    where p.vendor_id = p_vendor and c.phone = p_phone
    order by c.created_at asc;
end;
$$;

grant execute on function loopkit.vendor_join(uuid, text) to anon, authenticated, service_role;
