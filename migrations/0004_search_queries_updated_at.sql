-- =============================================================
-- Migration 0004 — Consistency fix: search_queries.updated_at.
-- Apply once via the Supabase SQL Editor.
--
-- Background: `preferences` has updated_at + touch_updated_at()
-- trigger from 0001. `search_queries` did not. The Preferences UI
-- (B5) needs a reliable "last changed" timestamp to render the
-- searches list in stable order — adding it here aligns the table
-- with `preferences` and unlocks deterministic sort.
--
-- Idempotent: re-applying is safe.
-- =============================================================


-- ---------- 1. Add updated_at, backfill existing rows ----------
alter table public.search_queries
  add column if not exists updated_at timestamptz not null default now();


-- ---------- 2. Touch trigger using the existing helper ----------
drop trigger if exists touch_search_queries_updated on public.search_queries;
create trigger touch_search_queries_updated
  before update on public.search_queries
  for each row execute function public.touch_updated_at();


-- ---------- 3. Index to support the Preferences list view ----------
create index if not exists idx_search_queries_user_updated
  on public.search_queries (user_id, updated_at desc);


-- =============================================================
-- END migration 0004
-- =============================================================
