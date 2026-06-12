-- =============================================================
-- Migration 0011 — job_results.origin (task W1).
--
-- Persists each result row's provenance so the web app can render
-- Local (Palestinian) jobs and Global / Remote jobs as separate
-- sections (web task 3.1b):
--   * 'global' — JobSpy searches + public APIs (Remotive, Arbeitnow, …)
--   * 'local'  — the shared Palestinian local-market collector
--                (core_local_sources: ddg_linkedin / ddg_website /
--                telegram / jobs_ps …, collapsed to one value here;
--                the fine-grained source stays worker-side)
--
-- Nullable on purpose: rows written before this migration have no
-- provenance and the UI shows them in a single untagged section.
--
-- Deploy order: apply this BEFORE deploying the worker change that
-- writes `origin` (multi_user_runner._jobs_to_rows). The worker also
-- carries a strip-and-retry fallback, but don't rely on it.
--
-- Idempotent: re-applying is safe.
-- =============================================================

alter table public.job_results
  add column if not exists origin text
  check (origin in ('global', 'local') or origin is null);

comment on column public.job_results.origin is
  'Provenance: global (JobSpy/APIs) or local (Palestinian local sources). NULL = row predates migration 0011.';

-- The dashboard groups a run''s rows by origin — covered by the existing
-- idx_job_results_run index plus this narrow column; no new index needed
-- at current row counts.

notify pgrst, 'reload schema';

-- =============================================================
-- END migration 0011
-- =============================================================
