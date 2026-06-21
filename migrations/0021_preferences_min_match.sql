-- =============================================================
-- Migration 0021 — per-user minimum match threshold (digest pref).
--
-- Lets a user cut noise by only EMAILING jobs whose match_percentage
-- is at least this value. 0 (the default) = no filter = current
-- behavior. The threshold gates the daily email only; the dashboard
-- still shows every result for that run so feedback/review is
-- unaffected.
--
-- Nullable-safe via a default + the worker treating NULL/absent as 0,
-- and the worker degrades (retries its preferences SELECT without this
-- column) if it's somehow not applied yet — so deploy order isn't
-- strict. Idempotent.
-- =============================================================

alter table public.preferences
  add column if not exists min_match_percentage int not null default 0
    check (min_match_percentage between 0 and 100);

comment on column public.preferences.min_match_percentage is
  'Only email jobs with match_percentage >= this (0 = no filter). Gates the email digest, not the dashboard.';
