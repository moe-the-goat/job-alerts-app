-- =============================================================
-- Migration 0001 — Initial schema for the multi-user Job Alerts platform.
-- Apply once via the Supabase SQL Editor on a fresh project.
--
-- Design principles:
--   * Every public table has Row-Level Security (RLS) ENABLED.
--     The user-facing SDK (anon key) can only see / mutate the
--     caller's own rows. The worker uses the service_role key,
--     which BYPASSES RLS by design.
--   * Account deletion is GDPR-compliant via ON DELETE CASCADE
--     from auth.users down through profiles to every per-user table.
--   * The schema is idempotent: every statement uses
--     `IF NOT EXISTS` / `DROP ... IF EXISTS` so re-applying is safe.
--   * CHECK constraints prevent garbage data at the DB layer.
--   * Indexes match the actual query patterns (cron, dashboard).
-- =============================================================


-- ---------- 1. PROFILES (1:1 with auth.users) ----------
create table if not exists public.profiles (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  display_name    text,
  cv_text         text,                                       -- parsed CV plaintext
  cv_file_path    text,                                       -- pointer into Supabase Storage
  cv_uploaded_at  timestamptz,
  is_whitelisted  boolean not null default false,             -- toggle for closed beta
  is_admin        boolean not null default false,             -- gates /admin route
  created_at      timestamptz not null default now()
);
comment on table public.profiles is
  'Per-user profile + CV. 1:1 with auth.users. Auto-created by trigger on signup.';

alter table public.profiles enable row level security;

drop policy if exists profiles_self_select on public.profiles;
drop policy if exists profiles_self_insert on public.profiles;
drop policy if exists profiles_self_update on public.profiles;

create policy profiles_self_select on public.profiles
  for select using (auth.uid() = user_id);
create policy profiles_self_insert on public.profiles
  for insert with check (auth.uid() = user_id);
create policy profiles_self_update on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- No DELETE policy: account removal happens via auth.users CASCADE.


-- ---------- 2. PREFERENCES (1:1 user) ----------
create table if not exists public.preferences (
  user_id             uuid primary key references public.profiles(user_id) on delete cascade,
  frequency_hours     int not null default 24
                      check (frequency_hours in (1, 24, 48, 168)),     -- hourly debug / daily / 2d / weekly
  is_active           boolean not null default true,
  next_run_at         timestamptz not null default now(),               -- the cron query reads this
  notification_email  text not null,
  ai_eval_top_n       int not null default 30
                      check (ai_eval_top_n between 5 and 100),          -- how many top jobs reach the AI
  api_hours_old       int not null default 72
                      check (api_hours_old between 1 and 720),          -- recency window for public APIs
  updated_at          timestamptz not null default now()
);
comment on table public.preferences is
  'Per-user global pipeline settings: scheduling, AI budget, and where to deliver.';

alter table public.preferences enable row level security;

drop policy if exists preferences_self_all on public.preferences;
create policy preferences_self_all on public.preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Partial index — the cron query (`WHERE is_active AND next_run_at <= now()`)
-- only ever needs active rows; partial index keeps it small and fast.
create index if not exists idx_preferences_next_run
  on public.preferences (next_run_at)
  where is_active = true;


-- ---------- 3. SEARCH_QUERIES (1:many user) ----------
create table if not exists public.search_queries (
  id              bigserial primary key,
  user_id         uuid not null references public.profiles(user_id) on delete cascade,
  search_term     text not null,
  location        text not null default 'Worldwide',
  sites           jsonb not null default '["linkedin","indeed"]'::jsonb,
  job_type        text check (job_type in ('fulltime','internship','contract','parttime') or job_type is null),
  is_remote       boolean not null default true,
  results_wanted  int not null default 30 check (results_wanted between 1 and 100),
  hours_old       int not null default 24 check (hours_old between 1 and 720),
  country_indeed  text not null default 'USA',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
comment on table public.search_queries is
  'Per-user JobSpy search specs. One row = one entry in the old config.json["searches"] list.';

alter table public.search_queries enable row level security;

drop policy if exists search_queries_self_all on public.search_queries;
create policy search_queries_self_all on public.search_queries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_search_queries_user_active
  on public.search_queries (user_id)
  where is_active = true;


-- ---------- 4. RUNS (1:many user) ----------
create table if not exists public.runs (
  id           bigserial primary key,
  user_id      uuid not null references public.profiles(user_id) on delete cascade,
  status       text not null default 'running'
               check (status in ('running','success','failed','skipped')),
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,                                     -- null while status='running'
  scraped      int not null default 0,
  filtered     int not null default 0,
  ai_evaluated int not null default 0,                          -- after pre-screen + top-N
  approved     int not null default 0,
  lower_ranked int not null default 0,
  error        text                                             -- populated when status='failed'
);
comment on table public.runs is
  'One row per pipeline execution per user. status updated by the worker.';

alter table public.runs enable row level security;

drop policy if exists runs_self_select on public.runs;
create policy runs_self_select on public.runs
  for select using (auth.uid() = user_id);
-- INSERT/UPDATE only via the worker's service_role key.

create index if not exists idx_runs_user_started
  on public.runs (user_id, started_at desc);


-- ---------- 5. SEEN_JOBS (1:many user) ----------
create table if not exists public.seen_jobs (
  user_id      uuid not null references public.profiles(user_id) on delete cascade,
  job_url      text not null,
  evaluated_at timestamptz not null default now(),
  primary key (user_id, job_url)
);
comment on table public.seen_jobs is
  'Per-user URL dedup. Replaces seen_jobs.json from single-user mode.';

alter table public.seen_jobs enable row level security;

drop policy if exists seen_jobs_self_select on public.seen_jobs;
create policy seen_jobs_self_select on public.seen_jobs
  for select using (auth.uid() = user_id);
-- The worker writes via service_role. Users read via the dashboard.

create index if not exists idx_seen_jobs_user_eval
  on public.seen_jobs (user_id, evaluated_at);


-- ---------- 6. JOB_RESULTS (1:many run) ----------
create table if not exists public.job_results (
  id                       bigserial primary key,
  run_id                   bigint not null references public.runs(id) on delete cascade,
  user_id                  uuid not null references public.profiles(user_id) on delete cascade,
  title                    text,
  company                  text,
  location                 text,
  job_url                  text,
  ai_evaluated             boolean not null default false,    -- true for top-N + wildcards
  ai_verdict               text,
  is_valid                 boolean,
  match_percentage         int    check (match_percentage between 0 and 100),
  tech_fit                 int    check (tech_fit between 0 and 100),
  experience_fit           int    check (experience_fit between 0 and 100),
  logistics_fit            int    check (logistics_fit between 0 and 100),
  compensation             text,
  effort                   text   check (effort in ('low','medium','high','unknown') or effort is null),
  suspicious               boolean not null default false,
  pre_flagged_low_quality  boolean not null default false,
  pre_flagged_trusted      boolean not null default false,
  similarity               numeric(5, 4),                       -- 0.0000-1.0000 from core_embedding
  created_at               timestamptz not null default now()
);
comment on table public.job_results is
  'One row per surfaced job per run. ai_evaluated=false rows are the lower-ranked summary; AI columns may be NULL for those.';

alter table public.job_results enable row level security;

drop policy if exists job_results_self_select on public.job_results;
create policy job_results_self_select on public.job_results
  for select using (auth.uid() = user_id);

create index if not exists idx_job_results_user_created
  on public.job_results (user_id, created_at desc);
create index if not exists idx_job_results_run
  on public.job_results (run_id);


-- ---------- 7. FEEDBACK (1 row per (user, job)) ----------
create table if not exists public.feedback (
  user_id   uuid not null references public.profiles(user_id) on delete cascade,
  job_url   text not null,
  action    text not null
            check (action in ('applied','rejected','interview','offer','ignored')),
  noted_at  timestamptz not null default now(),
  primary key (user_id, job_url)
);
comment on table public.feedback is
  'User-reported outcome per job URL. ON CONFLICT (user_id, job_url) DO UPDATE to track state changes.';

alter table public.feedback enable row level security;

drop policy if exists feedback_self_all on public.feedback;
create policy feedback_self_all on public.feedback
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Guarded: migration 0002 drops + rebuilds this table with
-- `submitted_at` instead of `noted_at`. Re-running 0001 after 0002
-- would otherwise fail trying to index a column that no longer exists.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'feedback'
      and column_name = 'noted_at'
  ) then
    create index if not exists idx_feedback_user_noted
      on public.feedback (user_id, noted_at desc);
  end if;
end $$;


-- ---------- 8. Auto-create profile on signup ----------
-- When Supabase Auth creates a new auth.users row, automatically insert the
-- matching profiles row so the rest of the app can rely on it existing.
-- security definer = run as the function owner (postgres), not as the caller.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------- 9. updated_at touch helper ----------
-- Keeps preferences.updated_at honest without forcing the API code to set it.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_preferences_updated on public.preferences;
create trigger touch_preferences_updated
  before update on public.preferences
  for each row execute function public.touch_updated_at();


-- =============================================================
-- END migration 0001
-- =============================================================
