-- supabase/migrations/0009_loopkit_enroll_phone_guard.sql
-- Harden the anonymous enroll surface: reject malformed phone strings inside
-- enroll_card itself. The /c action normalizes the phone, but enroll_card is
-- granted to anon and callable directly with the publishable key, so a direct
-- caller could otherwise seed cards with arbitrary junk. Keeps the
-- active-program guard from 0008. Idempotent (create or replace).

create or replace function loopkit.enroll_card(p_program uuid, p_phone text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  -- SG mobile in +65 canonical form (same shape normalizePhone produces).
  if p_phone !~ '^\+65[3689][0-9]{7}$' then
    return null;
  end if;
  if not exists (
    select 1 from loopkit.programs where id = p_program and active
  ) then
    return null;
  end if;
  insert into loopkit.cards (program_id, phone)
    values (p_program, p_phone)
  on conflict (program_id, phone) do nothing;
  select card_token into v_token
    from loopkit.cards
    where program_id = p_program and phone = p_phone;
  return v_token;
end;
$$;

grant execute on function loopkit.enroll_card(uuid, text) to anon, authenticated, service_role;
