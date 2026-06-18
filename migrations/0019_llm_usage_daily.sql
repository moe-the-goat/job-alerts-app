-- =============================================================
-- Migration 0019 — LLM usage tracking (admin Phase 3).
-- Apply once via the Supabase SQL Editor.
--
-- Records per-user, per-model API usage so the admin Analytics tab can show
-- calls today / this week / all-time, vs each model's free-tier caps, plus
-- best-effort tokens and a peak-RPM proxy.
--
-- Shape: one row per (user_id, provider, model, day). The worker tallies a
-- run's calls in memory and, at the end of each user-run, calls bump_llm_usage
-- once per (provider, model) to ADD that run's counts onto the day's row. Daily
-- counters (not row-per-call) keep this tiny and fast to read.
--
-- Idempotent: IF NOT EXISTS table + CREATE OR REPLACE function.
-- =============================================================


-- ---------- 1. Daily usage counters ----------
create table if not exists public.llm_usage_daily (
  user_id          uuid not null references public.profiles(user_id) on delete cascade,
  provider         text not null,          -- 'Cerebras' | 'Groq' | 'Gemini'
  model            text not null,          -- e.g. 'gpt-oss-120b', 'gemini-embedding-001'
  day              date not null,          -- budget day (UTC) the calls happened on
  requests         int  not null default 0,
  requests_failed  int  not null default 0,
  tokens           bigint not null default 0,   -- summed where the provider reports it
  peak_rpm         int  not null default 0,     -- max calls in any 60s window that day
  updated_at       timestamptz not null default now(),
  primary key (user_id, provider, model, day)
);
comment on table public.llm_usage_daily is
  'Per-user, per-model daily LLM/embedding call counters. Written by the worker '
  'via bump_llm_usage at the end of each user-run. Read by the admin analytics.';

create index if not exists idx_llm_usage_day on public.llm_usage_daily (day);
create index if not exists idx_llm_usage_user on public.llm_usage_daily (user_id);

alter table public.llm_usage_daily enable row level security;
-- Service-role (worker + admin client) only. No anon/authenticated policies:
-- regular users never see usage; the admin reads it through the service-role
-- client, which bypasses RLS. Lock the table down explicitly.
revoke all on table public.llm_usage_daily from anon, authenticated;


-- ---------- 2. Atomic increment RPC ----------
-- SECURITY DEFINER so the worker's service-role client can upsert-add in one
-- round trip. requests/failed/tokens ADD onto the day's row; peak_rpm takes the
-- MAX (it's a rate, not a sum).
create or replace function public.bump_llm_usage(
  p_user_id uuid,
  p_provider text,
  p_model text,
  p_day date,
  p_requests int,
  p_requests_failed int,
  p_tokens bigint,
  p_peak_rpm int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.llm_usage_daily
    (user_id, provider, model, day, requests, requests_failed, tokens, peak_rpm, updated_at)
  values
    (p_user_id, p_provider, p_model, p_day,
     coalesce(p_requests, 0), coalesce(p_requests_failed, 0),
     coalesce(p_tokens, 0), coalesce(p_peak_rpm, 0), now())
  on conflict (user_id, provider, model, day) do update set
    requests        = public.llm_usage_daily.requests + excluded.requests,
    requests_failed = public.llm_usage_daily.requests_failed + excluded.requests_failed,
    tokens          = public.llm_usage_daily.tokens + excluded.tokens,
    peak_rpm        = greatest(public.llm_usage_daily.peak_rpm, excluded.peak_rpm),
    updated_at      = now();
end;
$$;

-- Only the service role calls this (worker). Revoke from the public roles.
revoke execute on function public.bump_llm_usage(uuid, text, text, date, int, int, bigint, int)
  from anon, authenticated;


-- PostgREST cache reload so the RPC is callable over the Data API.
notify pgrst, 'reload schema';

-- =============================================================
-- END migration 0019
-- =============================================================
