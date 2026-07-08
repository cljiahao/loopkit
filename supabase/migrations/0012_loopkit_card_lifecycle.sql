-- supabase/migrations/0012_loopkit_card_lifecycle.sql
-- Card lifecycle: vendor-configurable expiry (days from the customer's current
-- cycle start) and card regeneration (reissue a card's token + reset its
-- progress — for a lost QR or a fresh start after expiry). Expiry itself is
-- enforced in the TypeScript action layer (src/app/dashboard/actions.ts)
-- against the columns added here, not inside add_stamp/record_visit — it's a
-- loyalty-semantics rule, not an authorization boundary, so it stays out of
-- the already-hardened write RPCs.

alter table loopkit.programs
  add column expiry_days int
    check (expiry_days is null or expiry_days between 1 and 3650);

alter table loopkit.cards
  add column cycle_started_at timestamptz;
update loopkit.cards set cycle_started_at = created_at
  where cycle_started_at is null;
alter table loopkit.cards
  alter column cycle_started_at set not null,
  alter column cycle_started_at set default now();

alter table loopkit.stamp_events drop constraint if exists stamp_events_kind_check;
alter table loopkit.stamp_events
  add constraint stamp_events_kind_check
  check (kind in ('stamp','redeem','visit','win','regen'));

-- create_program: additive trailing p_expiry_days (defaulted, so existing
-- callers keep working unchanged). Same vendor/Pro gate as 0008.
create or replace function loopkit.create_program(
  p_type            text,
  p_name            text,
  p_stamps_required int,
  p_reward_text     text,
  p_config          jsonb,
  p_expiry_days     int default null
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
    or (select count(*) from loopkit.programs where vendor_id = v_uid) < 1
  ) then
    raise insufficient_privilege;
  end if;
  insert into loopkit.programs
    (vendor_id, type, name, stamps_required, reward_text, config, expiry_days)
    values (v_uid, p_type, p_name, p_stamps_required, p_reward_text, p_config, p_expiry_days)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function loopkit.create_program(text, text, int, text, jsonb, int) to authenticated;

-- card_view gains expiry_days + cycle_started_at so the customer /c page can
-- show (or the app can compute) an expired state. Adding columns changes the
-- return type, so drop first and restate the grant (same as 0008's A1).
drop function if exists loopkit.card_view(uuid, text);
create or replace function loopkit.card_view(p_program uuid, p_phone text)
returns table (
  name text, type text, config jsonb, state jsonb, stamp_count int,
  card_token text, reward_text text, stamps_required int,
  expiry_days int, cycle_started_at timestamptz
)
language sql security definer stable set search_path = '' as $$
  select p.name, p.type, p.config, coalesce(c.state, '{}'::jsonb),
         coalesce(c.stamp_count, 0), c.card_token, p.reward_text,
         p.stamps_required, p.expiry_days, c.cycle_started_at
  from loopkit.programs p
  left join loopkit.cards c on c.program_id = p.id and c.phone = p_phone
  where p.id = p_program and p.active;
$$;

grant execute on function loopkit.card_view(uuid, text) to anon, authenticated, service_role;

-- Regenerate a card (public, phone-validated like enroll_card/0009): reissues
-- the card_token (invalidates the old QR), resets progress to a fresh start,
-- and resets the expiry clock. Used both by a vendor (dashboard, for a
-- customer who lost their code or whose card expired) and by a customer
-- self-service from /c — same trust model as enroll_card: identity is the
-- phone number, there's no separate customer auth in this app. Preserves
-- reward_count (lifetime redemptions) — only the current cycle resets.
create or replace function loopkit.regenerate_card(p_program uuid, p_phone text)
returns loopkit.cards
language plpgsql security definer set search_path = '' as $$
declare
  v_card loopkit.cards;
begin
  if p_phone !~ '^\+65[3689][0-9]{7}$' then
    raise exception 'invalid phone';
  end if;
  if not exists (
    select 1 from loopkit.programs where id = p_program and active
  ) then
    raise exception 'program not found';
  end if;

  update loopkit.cards
    set state = '{}'::jsonb,
        stamp_count = 0,
        card_token = replace(gen_random_uuid()::text, '-', ''),
        cycle_started_at = now(),
        last_event_at = null,
        updated_at = now()
    where program_id = p_program and phone = p_phone
  returning * into v_card;

  if v_card.id is null then
    raise exception 'no card for that number';
  end if;

  insert into loopkit.stamp_events (card_id, kind, payload)
    values (v_card.id, 'regen', '{}'::jsonb);

  return v_card;
end;
$$;

grant execute on function loopkit.regenerate_card(uuid, text) to anon, authenticated, service_role;
