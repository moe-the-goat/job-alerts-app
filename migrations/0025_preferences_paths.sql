-- =============================================================
-- Migration 0025 — per-user career paths (Tier 5a).
--
-- The user's selected tracks (backend, ai_ml, devops, …) as an array of slugs.
-- From Tier 5b these drive scrape targeting, per-user role weighting, filtering,
-- and the verdict prompt. Empty by default so behavior is unchanged until a user
-- picks paths (and until 5b reads them). Validated against the app-side catalog.
-- Idempotent.
-- =============================================================

alter table public.preferences
  add column if not exists paths text[] not null default '{}';
