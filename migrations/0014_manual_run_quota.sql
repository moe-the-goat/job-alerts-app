-- =============================================================
-- Migration 0014 — Manual run controls + daily run quota.
--
-- Adds the data layer for the dashboard's "Run now" / "Reschedule"
-- Quick Actions. Two pieces:
--
--   1. runs.run_trigger — records whether a run was the scheduled cron
--      tick ('scheduled') or a user-initiated manual dispatch ('manual').
--      Lets us audit manual usage and is stamped by multi_user_runner.
--
--   2. runs_used_today(p_user_id) — a SECURITY DEFINER read RPC the web
--      app calls (it never holds the service-role key) to show the user
--      how many of their 2 daily runs are spent. The worker enforces the
--      cap independently by counting the same rows, so this RPC is purely
--      for display — it is NOT the source of truth and cannot grant runs.
--
-- "Today" is measured in Asia/Jerusalem (the project's schedule locale),
-- so the budget resets at local midnight, not UTC midnight.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE.
-- =============================================================


-- ---------- 1. runs.run_trigger ----------
alter table public.runs
  add column if not exists run_trigger text not null default 'scheduled';

-- Constrain to the two known origins. Drop-then-add so re-running the
-- migration (or tightening the check later) is safe.
alter table public.runs
  drop constraint if exists runs_run_trigger_check;
alter table public.runs
  add constraint runs_run_trigger_check
  check (run_trigger in ('scheduled', 'manual'));

comment on column public.runs.run_trigger is
  'How the run was initiated: scheduled (cron) or manual (user dispatch). '
  'Both count against the per-user daily run budget.';


-- ---------- 2. runs_used_today(p_user_id) ----------
-- Counts the caller-scoped user's runs since local-midnight Asia/Jerusalem.
-- SECURITY DEFINER so it can read runs regardless of RLS, but it only ever
-- counts the ONE user id passed in and returns a bare integer — it exposes
-- no row data. Granted to authenticated; the web app passes auth.uid().
create or replace function public.runs_used_today(p_user_id uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from public.runs
  where user_id = p_user_id
    -- Local-midnight boundary, expressed back in UTC for the comparison:
    -- take "now" in Jerusalem wall-clock, truncate to the day, then read
    -- that wall-clock instant back as a UTC timestamptz.
    and started_at >= (
      (date_trunc('day', (now() at time zone 'Asia/Jerusalem')))
        at time zone 'Asia/Jerusalem'
    );
$$;

comment on function public.runs_used_today(uuid) is
  'How many runs this user has started since local-midnight Asia/Jerusalem. '
  'Display helper for the 2/day budget; the worker enforces the cap itself.';

revoke all on function public.runs_used_today(uuid) from public;
grant execute on function public.runs_used_today(uuid) to authenticated;


-- Let PostgREST see the new function signature immediately.
notify pgrst, 'reload schema';
