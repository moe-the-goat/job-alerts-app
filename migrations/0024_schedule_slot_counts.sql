-- =============================================================
-- Migration 0024 — schedule slot-congestion counts (Tier 7).
--
-- Powers the reschedule "this hour is busy" hint. Returns, per hour-of-day
-- (Asia/Jerusalem), how many ACTIVE users are scheduled then — an AGGREGATE
-- only, never any user identity, so it's safe to expose to any signed-in user.
--
-- SECURITY DEFINER because a normal user can't read other users' preferences
-- rows under RLS, but the per-hour COUNT reveals nothing personal. Locked
-- search_path + a grant to `authenticated` only.
-- Idempotent.
-- =============================================================

create or replace function public.schedule_slot_counts()
returns table (slot_hour int, user_count int)
language sql
stable
security definer
set search_path = public
as $$
  select
    extract(hour from (next_run_at at time zone 'Asia/Jerusalem'))::int as slot_hour,
    count(*)::int as user_count
  from public.preferences
  where is_active = true
    and next_run_at is not null
  group by 1
  order by 1;
$$;

revoke all on function public.schedule_slot_counts() from public;
grant execute on function public.schedule_slot_counts() to authenticated;
