-- =============================================================
-- Migration 0026 — auto-seeded searches from paths (Tier 5c).
--
-- `search_queries.origin` distinguishes searches the app generated from the
-- user's career paths ('auto') from ones the user added/edited themselves
-- ('manual'). "Regenerate from paths" only ever replaces the 'auto' rows, so a
-- hand-tuned search is never clobbered ("auto-suggest, never auto-destroy").
--
-- `preferences.searches_seeded` gates the ONE-TIME auto-seed so re-saving paths
-- doesn't keep recreating searches — after the first seed, regeneration is a
-- deliberate button press. Both default to the pre-feature behavior. Idempotent.
-- =============================================================

alter table public.search_queries
  add column if not exists origin text not null default 'manual'
    check (origin in ('auto', 'manual'));

alter table public.preferences
  add column if not exists searches_seeded boolean not null default false;
