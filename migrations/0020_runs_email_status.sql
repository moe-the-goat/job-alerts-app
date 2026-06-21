-- =============================================================
-- Migration 0020 — runs email-delivery outcome (Tier D).
--
-- The worker records whether each run RAN, but not whether its
-- email actually SENT. These columns capture the delivery outcome
-- so the admin dashboard can surface send failures (a run can
-- "succeed" while its email silently fails — e.g. SMTP auth).
--
--   email_status:
--     'sent'    — email delivered to SMTP
--     'failed'  — send raised (email_error has the reason)
--     'skipped' — --dry-run, no email attempted
--     'none'    — run had no jobs to email
--     NULL      — row predates this migration
--   email_error: the SMTP error string when status='failed'.
--
-- Nullable + idempotent: safe to apply before/with the worker
-- change. The worker also degrades (retries the finalize without
-- these keys) if the columns are somehow absent, so deploy order
-- isn't strict.
-- =============================================================

alter table public.runs
  add column if not exists email_status text
    check (email_status in ('sent', 'failed', 'skipped', 'none') or email_status is null);

alter table public.runs
  add column if not exists email_error text;

comment on column public.runs.email_status is
  'Email delivery outcome: sent | failed | skipped (dry-run) | none (no jobs). NULL = predates migration 0020.';
comment on column public.runs.email_error is
  'SMTP error string when email_status = failed; NULL otherwise.';
