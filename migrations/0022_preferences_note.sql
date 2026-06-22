-- =============================================================
-- Migration 0022 — user-authored steering note (feedback loop).
--
-- The worker already DERIVES a `candidate_preferences` summary from
-- a user's feedback (shown read-only in the app as "what we've
-- learned"). This adds the other half of the loop: a free-text note
-- the USER writes to steer scoring directly ("prioritize internships",
-- "no crypto roles"). The worker folds it into the learned-preferences
-- context for every job verdict.
--
-- Distinct from candidate_preferences (auto-generated, overwritten
-- each cycle) so a user's note is never clobbered by the summarizer.
-- Nullable; the worker degrades (retries its SELECT without it) if the
-- column isn't applied yet. Idempotent.
-- =============================================================

alter table public.preferences
  add column if not exists preference_note text;

comment on column public.preferences.preference_note is
  'User-authored steering note, folded into every AI job verdict. NULL/empty = none. Separate from the auto-derived candidate_preferences.';
