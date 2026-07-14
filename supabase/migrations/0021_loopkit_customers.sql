create table loopkit.customers (
  vendor_id      uuid not null references auth.users(id) on delete cascade,
  phone          text not null,
  name           text,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  primary key (vendor_id, phone)
);

create index customers_vendor_idx on loopkit.customers (vendor_id);

alter table loopkit.customers enable row level security;

create policy customers_own on loopkit.customers for select using (vendor_id = (select auth.uid()));

grant select on loopkit.customers to authenticated;
grant all on loopkit.customers to service_role;

create or replace function loopkit.sync_customer_on_card()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_vendor_id uuid;
begin
  select vendor_id into v_vendor_id from loopkit.programs where id = new.program_id;
  insert into loopkit.customers (vendor_id, phone, name, first_seen_at, last_seen_at)
    values (v_vendor_id, new.phone, new.customer_name, new.created_at, new.created_at)
  on conflict (vendor_id, phone) do update set
    name = coalesce(excluded.name, loopkit.customers.name),
    last_seen_at = excluded.last_seen_at;
  return new;
end;
$$;

create trigger cards_sync_customer after insert on loopkit.cards for each row execute function loopkit.sync_customer_on_card();

create or replace function loopkit.sync_customer_on_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_vendor_id uuid; v_phone text;
begin
  select p.vendor_id, c.phone into v_vendor_id, v_phone
    from loopkit.cards c join loopkit.programs p on p.id = c.program_id
    where c.id = new.card_id;
  update loopkit.customers set last_seen_at = new.created_at where vendor_id = v_vendor_id and phone = v_phone;
  return new;
end;
$$;

create trigger stamp_events_sync_customer after insert on loopkit.stamp_events for each row execute function loopkit.sync_customer_on_activity();
