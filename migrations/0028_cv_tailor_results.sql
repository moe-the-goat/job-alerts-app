-- =============================================================
-- Migration 0028 — per-job CV tailoring (Tier 6b).
--
-- Stores every tailoring result so (a) a re-click is served from CACHE instead
-- of a fresh LLM call (keyed by the CV-content hash — a new CV invalidates
-- naturally), and (b) the DAILY CAP can count today's generations (Jerusalem
-- midnight, same day-boundary as the run budget). content is plain text — the
-- feature is deliberately text-first, not a PDF builder.
--
-- RLS: users see and write only their own rows (the server action runs with the
-- user's session, not service-role). job_result_id is a plain bigint (no FK) so
-- retention cleanup of old job_results never blocks on this table.
-- Idempotent.
-- =============================================================

create table if not exists public.cv_tailor_results (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  job_result_id bigint not null,
  mode text not null check (mode in ('suggestions', 'recreate')),
  cv_hash text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists cv_tailor_results_cache_idx
  on public.cv_tailor_results (user_id, job_result_id, mode, cv_hash);
create index if not exists cv_tailor_results_budget_idx
  on public.cv_tailor_results (user_id, mode, created_at);

alter table public.cv_tailor_results enable row level security;

drop policy if exists "cv_tailor_select_own" on public.cv_tailor_results;
create policy "cv_tailor_select_own" on public.cv_tailor_results
  for select using (auth.uid() = user_id);

drop policy if exists "cv_tailor_insert_own" on public.cv_tailor_results;
create policy "cv_tailor_insert_own" on public.cv_tailor_results
  for insert with check (auth.uid() = user_id);
