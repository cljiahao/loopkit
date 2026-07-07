-- loopkit demo seed — a "Kopi Corner" loyalty program with a spread of
-- customers and recent activity, so the dashboard and customers pages look
-- alive. Run in the loopkit Supabase project's SQL Editor AFTER 0001 + 0002.
--
-- 1. Find your vendor id:   select id, email from auth.users;
-- 2. Paste it into v_vendor below (replacing <YOUR_AUTH_USER_ID>).
-- 3. Run. Re-runnable: it wipes this vendor's existing program first (cascades
--    to their cards + events), then reseeds.

do $$
declare
  v_vendor  uuid := '<YOUR_AUTH_USER_ID>';
  v_program uuid;
begin
  -- Fresh start for this vendor (programs.vendor_id is unique; cascade clears
  -- the old cards and stamp_events).
  delete from loopkit.programs where vendor_id = v_vendor;

  insert into loopkit.programs (vendor_id, name, stamps_required, reward_text, active)
  values (v_vendor, 'Kopi Corner', 9, 'free kopi', true)
  returning id into v_program;

  -- Customers at various stages. Fixed ids so the events below can reference
  -- them. stamp_count is capped at 9 (the requirement) per the 0002 rule.
  insert into loopkit.cards (id, program_id, phone, stamp_count, reward_count, created_at, updated_at) values
    ('00000000-0000-0000-0000-0000000000c1', v_program, '+6591234567', 9, 0, now() - interval '12 days', now() - interval '2 hours'),
    ('00000000-0000-0000-0000-0000000000c2', v_program, '+6598765432', 6, 0, now() - interval '9 days',  now() - interval '22 hours'),
    ('00000000-0000-0000-0000-0000000000c3', v_program, '+6583334444', 3, 0, now() - interval '6 days',  now() - interval '3 days'),
    ('00000000-0000-0000-0000-0000000000c4', v_program, '+6592223333', 8, 1, now() - interval '20 days', now() - interval '5 hours'),
    ('00000000-0000-0000-0000-0000000000c5', v_program, '+6561234567', 1, 0, now() - interval '6 days',  now() - interval '6 days'),
    ('00000000-0000-0000-0000-0000000000c6', v_program, '+6581112222', 9, 2, now() - interval '40 days', now() - interval '25 minutes'),
    ('00000000-0000-0000-0000-0000000000c7', v_program, '+6590001111', 2, 0, now() - interval '1 hour',  now() - interval '40 minutes');

  -- Recent activity feed (most recent first once ordered by created_at desc).
  insert into loopkit.stamp_events (card_id, kind, created_at) values
    ('00000000-0000-0000-0000-0000000000c6', 'stamp',  now() - interval '25 minutes'),
    ('00000000-0000-0000-0000-0000000000c7', 'stamp',  now() - interval '40 minutes'),
    ('00000000-0000-0000-0000-0000000000c1', 'stamp',  now() - interval '2 hours'),
    ('00000000-0000-0000-0000-0000000000c4', 'redeem', now() - interval '5 hours'),
    ('00000000-0000-0000-0000-0000000000c2', 'stamp',  now() - interval '22 hours'),
    ('00000000-0000-0000-0000-0000000000c6', 'redeem', now() - interval '2 days'),
    ('00000000-0000-0000-0000-0000000000c3', 'stamp',  now() - interval '3 days'),
    ('00000000-0000-0000-0000-0000000000c5', 'stamp',  now() - interval '6 days');
end $$;
