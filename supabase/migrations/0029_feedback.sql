-- loopkit/supabase/migrations/0029_feedback.sql
-- Vendor NPS feedback table: allows authenticated vendors to submit feedback
-- via FeedbackForm component. RLS policy enforces self-insert only.

create table loopkit.feedback (
  id bigint generated always as identity primary key,
  vendor_id uuid not null references auth.users(id) on delete cascade,
  nps smallint not null check (nps between 0 and 10),
  message text,
  created_at timestamptz not null default now()
);

alter table loopkit.feedback enable row level security;

create policy feedback_self_insert on loopkit.feedback
  for insert
  to authenticated
  with check (vendor_id = auth.uid());

-- Explicit grants matching existing loopkit convention (see 0027_reward_vouchers, 0001_core).
-- Schema-level usage already granted in 0001; only table-specific grants needed here.
grant insert on loopkit.feedback to authenticated;
grant all on loopkit.feedback to service_role;
