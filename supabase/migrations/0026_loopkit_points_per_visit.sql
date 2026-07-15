-- supabase/migrations/0026_loopkit_points_per_visit.sql
-- Points Club: vendors set a fixed points_per_visit amount (config field,
-- default 1) instead of Stamp's implicit +1. Unlike Flame Club/Fill the Cup
-- (pure visual reskins, config is jsonb is jsonb, no migration needed), this
-- changes real accumulation behavior — add_stamp must read the amount from
-- config, and any program without points_per_visit set falls back to 1,
-- reproducing today's exact behavior with zero retroactive change.

-- Widen the stamps_required range (currently 2..20, added in 0001 as an
-- unnamed inline check) so a Points target can be set up to 100,000. The
-- constraint's auto-generated name is not guessed here — this DO block finds
-- it by inspecting its actual definition text and drops whatever it's really
-- called, avoiding the risk of a silently-redundant second constraint if a
-- guessed name were wrong. Stamp/Flame Club stay capped at 20 by the
-- application-layer Zod schema (Task 4), not by this DB constraint — the DB
-- range is now a looser outer bound shared by every stamp-type variant.
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'loopkit.programs'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%stamps_required%';

  if v_constraint_name is not null then
    execute format('alter table loopkit.programs drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table loopkit.programs
  add constraint programs_stamps_required_check
  check (stamps_required between 2 and 100000);

-- add_stamp: stamp_count now increments by the program's configured
-- points_per_visit (jsonb config field, coalesced to 1 when absent) instead
-- of a hardcoded 1. Both the "first stamp for this phone" insert and the
-- "existing card" update read the same coalesced amount.
create or replace function loopkit.add_stamp(p_program uuid, p_phone text)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare
  v_card loopkit.cards;
  v_config jsonb;
  v_amount int;
begin
  if not loopkit.owns_program(p_program) then
    raise exception 'not authorized';
  end if;

  select config into v_config from loopkit.programs where id = p_program;
  v_amount := coalesce((v_config->>'points_per_visit')::int, 1);

  -- First stamp for this phone: create the card and log it.
  insert into loopkit.cards (program_id, phone, stamp_count)
    values (p_program, p_phone, v_amount)
  on conflict (program_id, phone) do nothing
  returning * into v_card;
  if v_card.id is not null then
    insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
    return v_card;
  end if;

  -- Existing card: always increment by v_amount, no ceiling.
  update loopkit.cards
    set stamp_count = stamp_count + v_amount, updated_at = now()
    where program_id = p_program and phone = p_phone
  returning * into v_card;
  insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
  return v_card;
end;
$$;
