-- 0022 — remove the stamp ceiling and carry over excess stamps on redeem.
-- Idempotent: create-or-replace restates both function bodies in full;
-- no schema/column changes, no grants to restate (signatures unchanged).

-- add_stamp: stamp_count now increments unconditionally — a full card keeps
-- earning past stamps_required instead of silently no-op'ing. Every stamp
-- (including ones past the requirement) still logs a stamp_events row, since
-- there is no longer a "ceiling, no-op" branch to distinguish from a real
-- stamp.
create or replace function loopkit.add_stamp(p_program uuid, p_phone text)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare
  v_card loopkit.cards;
begin
  if not loopkit.owns_program(p_program) then
    raise exception 'not authorized';
  end if;

  -- First stamp for this phone: create the card and log it.
  insert into loopkit.cards (program_id, phone, stamp_count)
    values (p_program, p_phone, 1)
  on conflict (program_id, phone) do nothing
  returning * into v_card;
  if v_card.id is not null then
    insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
    return v_card;
  end if;

  -- Existing card: always increment, no ceiling.
  update loopkit.cards
    set stamp_count = stamp_count + 1, updated_at = now()
    where program_id = p_program and phone = p_phone
  returning * into v_card;
  insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
  return v_card;
end;
$$;

-- redeem: consume exactly one card's worth of stamps and carry the rest
-- forward, instead of resetting to zero. reward_count still increments by
-- exactly one per call — a card with 2x+ the requirement in stamp_count
-- does not grant multiple rewards from a single redeem call (the vendor can
-- simply redeem again immediately if the leftover still qualifies).
create or replace function loopkit.redeem(p_card uuid)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare
  v_card     loopkit.cards;
  v_required int;
begin
  select c.*, p.stamps_required into v_card, v_required
    from loopkit.cards c
    join loopkit.programs p on p.id = c.program_id
    where c.id = p_card;
  if v_card.id is null or not loopkit.owns_program(v_card.program_id) then
    raise exception 'not authorized';
  end if;
  update loopkit.cards
    set stamp_count = greatest(stamp_count - v_required, 0),
        reward_count = reward_count + 1,
        updated_at = now()
    where id = p_card returning * into v_card;
  insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'redeem');
  return v_card;
end;
$$;
