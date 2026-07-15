-- supabase/migrations/0024_loopkit_head_start_percent.sql
-- Vendor-configurable head-start amount: head_start was previously a fixed
-- ~20% seed for stamp/plant (migration 0014). This adds a percentage knob
-- (5-50, default 20) so vendors control how much of a head start they give
-- away. Streak is untouched — there's no fractional-period representation,
-- so it keeps its fixed one-full-period seed regardless of this column.
-- Plant's Sprout-stage floor (25%) also stays a fixed literal: a seed below
-- that threshold would render as a fresh, un-seeded "Seed" card no matter
-- what percentage produced it, defeating the point of the feature.

alter table loopkit.programs
  add column head_start_percent integer not null default 20
    check (head_start_percent between 5 and 50);

-- create_program: additive trailing p_head_start_percent (defaulted to 20,
-- so existing callers keep working unchanged). Same idiom as every prior
-- extension of this function (0012/0016/0018/0023).
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
  p_head_start_percent int default 20
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
     head_start, carry_over_stamps, active, head_start_percent)
    values (v_uid, p_type, p_name, p_stamps_required, p_reward_text, p_config,
            p_expiry_days, p_head_start, p_carry_over_stamps, p_active, p_head_start_percent)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function loopkit.create_program(
  text, text, int, text, jsonb, int, boolean, boolean, boolean, int
) to authenticated;

-- enroll_card: stamp/plant's seed now scales by the program's own
-- head_start_percent instead of the old flat 20%. Plant's Sprout-stage
-- floor (25% of stamps_required) and streak's fixed one-period seed are
-- both unchanged — see the header comment above for why.
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
    v_seed := greatest(1, round(v_program.stamps_required * v_program.head_start_percent / 100.0)::int);
    if v_program.type = 'stamp' then
      v_seed_stamp_count := least(v_seed, v_program.stamps_required - 1);
    elsif v_program.type = 'plant' then
      v_seed_state := jsonb_build_object(
        'growth', least(
          greatest(v_seed, round(v_program.stamps_required * 0.25)::int),
          v_program.stamps_required - 1
        ),
        'last_visit_at', now(),
        'blooms', 0,
        'bloomed', false
      );
    elsif v_program.type = 'streak' then
      -- current_streak is always exactly 1, not v_seed-scaled: streak's head
      -- start is one full period, not a percentage-of-threshold ratio like
      -- stamp/plant (a fractional streak has no meaningful representation).
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
