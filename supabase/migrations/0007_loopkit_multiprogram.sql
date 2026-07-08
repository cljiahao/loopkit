-- supabase/migrations/0007_loopkit_multiprogram.sql
-- A vendor may now own many programs (free = 1, Pro = unlimited). Drop the
-- one-program-per-vendor unique constraint; add a Pro allow-list + predicate.
-- The free/Pro limit is enforced in the create action (server-side), not here.

alter table loopkit.programs
  drop constraint if exists programs_vendor_id_key;
create index if not exists programs_vendor_idx on loopkit.programs (vendor_id);

create table loopkit.vendor_pro (
  vendor_id  uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function loopkit.is_pro(p_uid uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from loopkit.vendor_pro where vendor_id = p_uid);
$$;

alter table loopkit.vendor_pro enable row level security;
create policy vendor_pro_self_or_admin_select on loopkit.vendor_pro
  for select using (
    vendor_id = (select auth.uid()) or loopkit.is_admin((select auth.uid()))
  );

grant select on loopkit.vendor_pro to authenticated;
grant all on loopkit.vendor_pro to service_role;
grant execute on function loopkit.is_pro(uuid) to authenticated, service_role;

-- Grant a vendor Pro (admin/SQL only; there is no self-serve billing yet):
--   insert into loopkit.vendor_pro (vendor_id) values ('<VENDOR_AUTH_USER_ID>');
