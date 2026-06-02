-- =============================================================
-- Migration 0009 — Per-user job embedding history (semantic dedup).
-- Apply once via the Supabase SQL Editor.
--
-- Background: the legacy single-user pipeline drops "same job reposted at a
-- new URL" duplicates by keeping a rolling 14-day cache of each surfaced
-- job's CV-prerank embedding (data/embedding_history.json) and cosine-
-- comparing new jobs against it (core_embedding.drop_semantic_duplicates).
-- The multi-user worker had no equivalent — a local JSON file can't persist
-- across cloud runs and isn't per-user. This table is that cache, per user.
--
-- Stored as jsonb (a plain float array), NOT pgvector: the comparison is a
-- Python cosine loop over the last 14 days, not a pgvector ORDER BY, so we
-- avoid the dimension-lock + ivfflat caps that bit feedback_embeddings (0008).
--
-- Bounded by the weekly Retention Cleanup (14-day cutoff) so it stays small.
--
-- Idempotent.
-- =============================================================


create table if not exists public.job_embeddings (
  user_id     uuid not null references public.profiles(user_id) on delete cascade,
  job_url     text not null,
  embedding   jsonb not null,                 -- pre-rank vector as a float array
  embedded_at timestamptz not null default now(),
  primary key (user_id, job_url)
);
comment on table public.job_embeddings is
  'Rolling per-user cache of surfaced jobs prerank embeddings for semantic dedup. Pruned to ~14 days.';

alter table public.job_embeddings enable row level security;

drop policy if exists job_embeddings_self_select on public.job_embeddings;
create policy job_embeddings_self_select on public.job_embeddings
  for select using (auth.uid() = user_id);
-- Worker writes via service_role (bypasses RLS).

grant select on public.job_embeddings to authenticated;

-- The worker loads "this user's rows from the last N days", so index that.
create index if not exists idx_job_embeddings_user_recent
  on public.job_embeddings (user_id, embedded_at desc);


-- =============================================================
-- END migration 0009
-- =============================================================
