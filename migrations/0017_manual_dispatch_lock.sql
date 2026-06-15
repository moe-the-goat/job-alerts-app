-- =============================================================
-- Migration 0017 — Manual-run dispatch lock (fixes the double-press bug).
-- Apply once via the Supabase SQL Editor.
--
-- Bug: triggerManualRunAction guarded against a double "Run now" by checking
-- "is the latest run already 'running'?". But after a dispatch, the worker
-- doesn't create the runs row until it boots (~30s later). In that window a
-- second press passes the check and dispatches AGAIN — two runs, both daily
-- slots burned. The client's isPending flag only guards one modal, not two
-- tabs / network lag / the dispatch-to-row gap.
--
-- Fix: a per-user dispatch timestamp the action claims ATOMICALLY before
-- dispatching. A conditional UPDATE (only when the last dispatch is null or
-- older than the cooldown) returns the row only to the FIRST request; the
-- racing second request updates zero rows and is rejected. The DB row lock on
-- a single-row UPDATE serializes the two, so exactly one wins.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- =============================================================

alter table public.preferences
  add column if not exists last_manual_dispatch_at timestamptz;

comment on column public.preferences.last_manual_dispatch_at is
  'Set atomically by triggerManualRunAction right before dispatching a manual '
  'run. A conditional UPDATE on this column is the lock that prevents a '
  'double-press from dispatching two runs in the gap before the runs row exists.';

-- =============================================================
-- END migration 0017
-- =============================================================
