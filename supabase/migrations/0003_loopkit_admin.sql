-- 0003 — platform-operator admin: an internal allow-list of admins and an audit
-- trail of the actions they take. Cross-vendor admin reads/writes run through
-- the service-role client (bypasses RLS), so the existing programs/cards/
-- stamp_events policies stay untouched; these two tables + is_admin() back only
-- the membership gate and the audit log.

create table loopkit.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- membership predicate (SECURITY DEFINER; pinned search_path). It reads the
-- table directly (RLS-exempt), so the admins_admin_select policy below can call
-- it without recursing on itself — same shape as owns_program in 0001.
create or replace function loopkit.is_admin(p_uid uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from loopkit.admins where user_id = p_uid);
$$;

create table loopkit.admin_audit (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references auth.users(id),
  action     text not null,
  target_id  uuid,
  detail     jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_created_idx on loopkit.admin_audit (created_at desc);

-- RLS: only admins may read either table; writes are service-role only, so no
-- write policies exist (admin actions use the service-role client).
alter table loopkit.admins      enable row level security;
alter table loopkit.admin_audit enable row level security;

create policy admins_admin_select on loopkit.admins
  for select using (loopkit.is_admin((select auth.uid())));
create policy admin_audit_admin_select on loopkit.admin_audit
  for select using (loopkit.is_admin((select auth.uid())));

-- Data-API grants (be explicit).
grant select on loopkit.admins, loopkit.admin_audit to authenticated;
grant all on loopkit.admins, loopkit.admin_audit to service_role;
grant execute on function loopkit.is_admin(uuid) to anon, authenticated, service_role;

-- Bootstrap the first admin by SQL (there is no UI to self-elevate). Find your
-- id under Authentication → Users, then run:
--   insert into loopkit.admins (user_id) values ('<YOUR_AUTH_USER_ID>');
