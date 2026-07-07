-- supabase/migrations/0005_loopkit_record_visit.sql
-- Generic engine write path: the TypeScript strategy computes the new card state;
-- this persists it (state + last_event_at) and logs one event. Vendor-gated via
-- owns_program. Used by non-stamp types (Lucky Tap and later Sprout); the stamp
-- card keeps its existing add_stamp path for now.

create or replace function loopkit.record_visit(
  p_program uuid,
  p_phone   text,
  p_state   jsonb,
  p_kind    text,
  p_payload jsonb
)
returns loopkit.cards
language plpgsql security definer set search_path = '' as $$
declare
  v_card loopkit.cards;
begin
  if not loopkit.owns_program(p_program) then
    raise exception 'not authorized';
  end if;

  insert into loopkit.cards (program_id, phone, state, last_event_at)
    values (p_program, p_phone, p_state, now())
  on conflict (program_id, phone) do update
    set state = excluded.state,
        last_event_at = now(),
        updated_at = now()
  returning * into v_card;

  insert into loopkit.stamp_events (card_id, kind, payload)
    values (v_card.id, p_kind, p_payload);

  return v_card;
end;
$$;

grant execute on function loopkit.record_visit(uuid, text, jsonb, text, jsonb) to authenticated, service_role;
