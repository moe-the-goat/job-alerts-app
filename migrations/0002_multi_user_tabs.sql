-- =============================================================
-- Migration 0002 — Tab A / Tab B model + RAG embeddings.
-- Builds on 0001_initial_schema.sql (lives in the worker repo
-- moe-the-goat/Automated-AI-Job-Intelligence-System; will be
-- copied here in a later cleanup).
--
-- Adds:
--   * pgvector extension
--   * profiles.cv_embedding, profiles.feedback_count
--   * preferences.candidate_preferences, preferences.last_digest_at
--   * job_results.description_excerpt (load-bearing for Tab B URL rot)
--   * NEW feedback table (append-only redesign — replaces the
--     primary-keyed (user_id, job_url) version from 0001)
--   * NEW feedback_embeddings (pgvector ivfflat)
--   * NEW bookmarks (Tab B personal CRM)
--   * NEW reputation (global v1)
--
-- The old feedback table from 0001 is dropped and recreated.
-- Safe because no production rows live in it yet — Mohammad's
-- feedback corpus is still in the GitHub logs repo, brought
-- across by migrate_to_multi_user.py (task B9a).
--
-- Idempotent: re-applying is safe.
-- =============================================================


-- ---------- 1. Extension ----------
create extension if not exists vector;


-- ---------- 2. profiles: cv_embedding + feedback_count ----------
alter table public.profiles
  add column if not exists cv_embedding   vector(768),
  add column if not exists feedback_count int not null default 0;


-- ---------- 3. preferences: digest output + cadence tracker ----------
alter table public.preferences
  add column if not exists candidate_preferences text not null default '',
  add column if not exists last_digest_at        timestamptz;


-- ---------- 4. job_results: description excerpt for Tab B durability ----------
alter table public.job_results
  add column if not exists description_excerpt text;


-- ---------- 5. feedback (rebuilt: append-only) ----------
-- Old design: primary key (user_id, job_url) — one row per user/job, updated in place.
-- New design: bigserial id — each click appends. Matches the plan's
-- "write-once, historical record preserved" lifecycle.
drop table if exists public.feedback cascade;

create table public.feedback (
  id             bigserial primary key,
  user_id        uuid not null references public.profiles(user_id) on delete cascade,
  job_result_id  bigint references public.job_results(id) on delete set null,
  job_url        text not null,
  title          text,
  company        text,
  feedback_type  text not null
                 check (feedback_type in
                   ('applied','bookmarked','not_relevant','block_company','wrong_location','other')),
  note           text,
  submitted_at   timestamptz not null default now()
);
comment on table public.feedback is
  'Append-only AI training signal. Each click = one row. Embedded into feedback_embeddings for RAG.';

alter table public.feedback enable row level security;

drop policy if exists feedback_self_all on public.feedback;
create policy feedback_self_all on public.feedback
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_feedback_user_submitted
  on public.feedback (user_id, submitted_at desc);


-- ---------- 6. feedback_embeddings (pgvector RAG corpus) ----------
create table if not exists public.feedback_embeddings (
  feedback_id  bigint primary key references public.feedback(id) on delete cascade,
  user_id      uuid   not null references public.profiles(user_id) on delete cascade,
  embedding    vector(768),
  embedded_at  timestamptz not null default now()
);
comment on table public.feedback_embeddings is
  'Gemini Embedding 2 vectors for RAG retrieval. One row per feedback entry.';

alter table public.feedback_embeddings enable row level security;

drop policy if exists feedback_embeddings_self_select on public.feedback_embeddings;
create policy feedback_embeddings_self_select on public.feedback_embeddings
  for select using (auth.uid() = user_id);
-- Worker writes via service_role.

-- ivfflat on a per-user-filtered query benefits from low `lists` at small N.
-- Tune later when corpus crosses ~10k rows per user.
create index if not exists idx_feedback_embeddings_vec
  on public.feedback_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists idx_feedback_embeddings_user
  on public.feedback_embeddings (user_id);


-- ---------- 7. bookmarks (Tab B — personal CRM) ----------
create table if not exists public.bookmarks (
  id              bigserial primary key,
  user_id         uuid   not null references public.profiles(user_id) on delete cascade,
  job_result_id   bigint not null references public.job_results(id)   on delete cascade,
  status          text   not null default 'saved'
                  check (status in
                    ('saved','applied','phone_screen','interview','offer','closed')),
  close_reason    text
                  check (
                    close_reason is null
                    or close_reason in
                       ('rejected_by_company','withdrew','ghosted','accepted_elsewhere')
                  ),
  notes           text,
  status_history  jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, job_result_id)
);
comment on table public.bookmarks is
  'Tab B personal job-application tracker. No AI signal in v1.';

alter table public.bookmarks enable row level security;

drop policy if exists bookmarks_self_all on public.bookmarks;
create policy bookmarks_self_all on public.bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_bookmarks_user_updated
  on public.bookmarks (user_id, updated_at desc);

-- Re-use the existing touch_updated_at() helper from migration 0001.
drop trigger if exists touch_bookmarks_updated on public.bookmarks;
create trigger touch_bookmarks_updated
  before update on public.bookmarks
  for each row execute function public.touch_updated_at();


-- ---------- 8. reputation (global in v1) ----------
create table if not exists public.reputation (
  pattern_type  text not null
                check (pattern_type in ('blacklist_name','blacklist_handle','trust_boost')),
  pattern       text not null,
  added_by      uuid references auth.users(id),
  added_at      timestamptz not null default now(),
  primary key (pattern_type, pattern)
);
comment on table public.reputation is
  'Global blacklist / trust-boost list. Worker reads, admins write. RLS = readable by any authed user.';

alter table public.reputation enable row level security;

drop policy if exists reputation_authed_select on public.reputation;
create policy reputation_authed_select on public.reputation
  for select using (auth.role() = 'authenticated');
-- INSERT / UPDATE / DELETE only via service_role or an admin RPC (added later).


-- =============================================================
-- END migration 0002
-- =============================================================
