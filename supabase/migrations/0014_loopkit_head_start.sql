-- supabase/migrations/0014_loopkit_head_start.sql
-- Endowed Progress Effect (Nunes & Drèze 2006, Journal of Consumer Research):
-- a loyalty card pre-filled with ~20% progress toward its first reward
-- (2-of-10 stamps in the original study) hit 34% completion vs. 19% for a
-- blank card requiring the identical number of purchases — a head start
-- measurably lifts completion independent of objective distance to the
-- reward. Vendor opt-in (head_start), off by default: it's real reward
-- inventory the vendor is choosing to give away, their call. Meaningful only
-- for stamp/plant/streak — their redeem step accumulates toward a visible
-- goal; lucky/wheel/scratch are pity-counter mechanics with no goal to seed.

alter table loopkit.programs
  add column head_start boolean not null default false;

-- create_program: additive trailing p_head_start (defaulted, so existing
-- callers keep working unchanged). Same vendor/Pro gate as 0008/0012.
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
    or (select count(*) from loopkit.programs where vendor_id = v_uid) < 1
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

-- enroll_card: seed new cards with ~20% progress (Endowed Progress Effect)
-- when the program has head_start enabled. stamps_required doubles as each
-- type's completion threshold (visits_to_bloom for plant, target_streak for
-- streak — see src/lib/program.ts's saveProgramSchema), so one calculation
-- covers all three seedable types. Lucky/wheel/scratch are untouched — no
-- accumulating goal to seed, seeding their pity counter would be a different
-- (and weaker) mechanic, out of scope here.
create or replace function loopkit.enroll_card(p_program uuid, p_phone text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_token text;
  v_program loopkit.programs%rowtype;
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

  if v_program.head_start then
    v_seed := greatest(1, round(v_program.stamps_required * 0.2)::int);
    if v_program.type = 'stamp' then
      v_seed_stamp_count := least(v_seed, v_program.stamps_required - 1);
    elsif v_program.type = 'plant' then
      v_seed_state := jsonb_build_object(
        'growth', least(v_seed, v_program.stamps_required - 1),
        'last_visit_at', now(),
        'blooms', 0,
        'bloomed', false
      );
    elsif v_program.type = 'streak' then
      v_seed_state := jsonb_build_object(
        'current_streak', 1,
        'window_start', now(),
        'reward_banked', false
      );
    end if;
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
