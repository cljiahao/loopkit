alter table loopkit.programs
  add column replaced_by uuid references loopkit.programs(id);

-- Plan cap: free tier is "1 ACTIVE program", not "1 program ever". Without
-- this fix, deactivating a program to migrate its type would permanently
-- use up a free vendor's only program slot — they could never create the
-- replacement. The migration flow (see changeTypeAction) always deactivates
-- the old program before creating the new one, so by the time this count
-- runs, a single-program free vendor is already back to 0 active.
create or replace function loopkit.create_program(
  p_type            text,
  p_name            text,
  p_stamps_required int,
  p_reward_text     text,
  p_config          jsonb,
  p_expiry_days     int default null,
  p_head_start      boolean default false
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
    (vendor_id, type, name, stamps_required, reward_text, config, expiry_days, head_start)
    values (v_uid, p_type, p_name, p_stamps_required, p_reward_text, p_config, p_expiry_days, p_head_start)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function loopkit.create_program(text, text, int, text, jsonb, int, boolean) to authenticated;

-- vendor_join: surface the replacement program's name for a retired card, so
-- the customer's card page can say what to use instead of a bare "retired"
-- notice. Only the projection changes — enrollment/dedup logic is untouched.

-- Postgres cannot CREATE OR REPLACE a function whose RETURNS TABLE column
-- list changes (adding replaced_by_name here counts as one) — it errors
-- "cannot change return type of existing function." Drop it first.
drop function if exists loopkit.vendor_join(uuid, text);

create or replace function loopkit.vendor_join(p_vendor uuid, p_phone text)
returns table (
  program_id uuid, name text, type text, config jsonb, state jsonb,
  stamp_count int, card_token text, reward_text text, stamps_required int,
  expiry_days int, cycle_started_at timestamptz, active boolean,
  replaced_by_name text
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
           r.name
    from loopkit.cards c
    join loopkit.programs p on p.id = c.program_id
    left join loopkit.programs r on r.id = p.replaced_by
    where p.vendor_id = p_vendor and c.phone = p_phone
    order by c.created_at asc;
end;
$$;

grant execute on function loopkit.vendor_join(uuid, text) to anon, authenticated, service_role;
