-- =============================================================
-- Migration 0023 — per-user target experience level.
--
-- The pipeline was tuned for entry-level candidates: the worker
-- filters out senior roles and the AI prompt assumes a junior/new-grad
-- profile. This lets each user say what seniority they're targeting.
--   'entry'  (default) — current behavior: senior roles filtered out.
--   'mid' / 'senior'   — senior roles reach the AI, which scores them
--                         against the CV; the prompt states the target.
--
-- Default 'entry' preserves current behavior for every existing user.
-- Nullable-safe via the default + the worker treating NULL/absent as
-- 'entry', and the worker degrades (retries its preferences SELECT
-- without this column) if it's not applied yet — so deploy order isn't
-- strict. Idempotent.
-- =============================================================

alter table public.preferences
  add column if not exists experience_level text not null default 'entry'
    check (experience_level in ('entry', 'mid', 'senior'));

comment on column public.preferences.experience_level is
  'Target seniority (entry|mid|senior). Gates the worker''s per-user seniority filters and the AI verdict prompt. Default entry.';
