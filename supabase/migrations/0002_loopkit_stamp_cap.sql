-- 0002 — cap stamping at the program's requirement and expose the shop name.
-- Idempotent: re-running replaces the same function bodies. RLS/policies from
-- 0001 are untouched; grants are restated where a function is dropped/recreated.

-- add_stamp: never let stamp_count climb past stamps_required. Once a card is
-- full it stays full (idempotent ceiling) and no further stamp_events audit row
-- is written — only a stamp that actually moved the count is logged. Same
-- return shape (loopkit.cards) and vendor-owned check as 0001.
create or replace function loopkit.add_stamp(p_program uuid, p_phone text)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare
  v_card     loopkit.cards;
  v_required int;
begin
  if not loopkit.owns_program(p_program) then
    raise exception 'not authorized';
  end if;

  select stamps_required into v_required
    from loopkit.programs
    where id = p_program;

  -- First stamp for this phone: create the card and always log it.
  insert into loopkit.cards (program_id, phone, stamp_count)
    values (p_program, p_phone, 1)
  on conflict (program_id, phone) do nothing
  returning * into v_card;
  if v_card.id is not null then
    insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
    return v_card;
  end if;

  -- Existing card: add a stamp only while below the requirement.
  update loopkit.cards
    set stamp_count = stamp_count + 1, updated_at = now()
    where program_id = p_program and phone = p_phone
      and stamp_count < v_required
  returning * into v_card;
  if v_card.id is not null then
    insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
    return v_card;
  end if;

  -- Already at the ceiling: return the unchanged card, write no audit row.
  select * into v_card
    from loopkit.cards
    where program_id = p_program and phone = p_phone;
  return v_card;
end;
$$;

-- card_status: also return the program name so the public /c page can show the
-- customer which shop they're looking at. Adding a column changes the return
-- type, which create-or-replace can't do, so drop first and restate the grant.
drop function if exists loopkit.card_status(uuid, text);
create or replace function loopkit.card_status(p_program uuid, p_phone text)
returns table (name text, stamp_count int, stamps_required int, reward_text text)
language sql security definer stable set search_path = '' as $$
  select p.name, coalesce(c.stamp_count, 0), p.stamps_required, p.reward_text
  from loopkit.programs p
  left join loopkit.cards c on c.program_id = p.id and c.phone = p_phone
  where p.id = p_program and p.active;
$$;

grant execute on function loopkit.card_status(uuid, text) to anon, authenticated, service_role;
