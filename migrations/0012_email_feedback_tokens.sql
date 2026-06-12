-- =============================================================
-- Migration 0012 — Email feedback tokens (task W2).
--
-- Lets the daily email link to a public, phone-friendly feedback
-- page (/f/<token>) that works WITHOUT an app login:
--
--   * email_feedback_tokens — one row per (user, run) email. Stores
--     ONLY the SHA-256 hex of the token: a read of this table (or a
--     leaked backup) cannot reconstruct a working link. The raw
--     token exists only inside the email itself.
--   * email_feedback_jobs(p_token)    — SECURITY DEFINER read RPC.
--   * submit_email_feedback(p_token, p_job_result_id, p_feedback_type)
--                                     — SECURITY DEFINER write RPC.
--
-- Security model: the web app keeps using the anon key only (it has
-- no service-role credentials by design). The anon role gets NO table
-- access here — its only door is the two RPCs, which run as the
-- function owner and validate the token hash + expiry + job ownership
-- internally. RLS on every other table is untouched.
--
-- PREREQUISITE: migration 0011 (job_results.origin). The read RPC
-- selects `origin` so the page can group Local vs Global sections.
-- The guard below re-issues 0011's ADD COLUMN idempotently, so
-- applying 0012 on a database that already ran 0011 is a no-op and
-- applying it without 0011 still works.
--
-- Idempotent: re-applying is safe.
-- =============================================================


-- ---------- 0. Prerequisite guard (no-op when 0011 already ran) ----------
alter table public.job_results
  add column if not exists origin text
  check (origin in ('global', 'local') or origin is null);


-- ---------- 1. Token table ----------
create table if not exists public.email_feedback_tokens (
  id           bigserial primary key,
  token_hash   text not null unique,          -- hex sha256(raw token); raw never stored
  user_id      uuid   not null references public.profiles(user_id) on delete cascade,
  run_id       bigint not null references public.runs(id)          on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '30 days',
  use_count    int not null default 0,        -- observability: taps via this link
  last_used_at timestamptz
);
comment on table public.email_feedback_tokens is
  'W2: per-(user,run) secrets behind the email feedback page. Only the worker (service_role) inserts; anon interacts solely through the two RPCs below. Expired rows purged by cleanup_retention.py.';

alter table public.email_feedback_tokens enable row level security;
-- Deliberately NO policies: anon/authenticated cannot touch the table at all.
revoke all on table public.email_feedback_tokens from anon, authenticated;

create index if not exists idx_email_feedback_tokens_expires
  on public.email_feedback_tokens (expires_at);
create index if not exists idx_email_feedback_tokens_run
  on public.email_feedback_tokens (run_id);
create index if not exists idx_email_feedback_tokens_user
  on public.email_feedback_tokens (user_id);


-- ---------- 2. Read RPC: jobs behind a token ----------
-- Returns jsonb instead of a row set so error states travel in-band
-- ({ok:false, error:...}) and the page never has to distinguish
-- "empty result" from "bad token" by guesswork.
create or replace function public.email_feedback_jobs(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tok  public.email_feedback_tokens%rowtype;
  v_jobs jsonb;
  v_given jsonb;
begin
  if p_token is null or length(p_token) < 20 or length(p_token) > 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select t.* into v_tok
  from public.email_feedback_tokens t
  where t.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;
  if v_tok.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  select coalesce(
           jsonb_agg(to_jsonb(j) order by j.match_percentage desc nulls last),
           '[]'::jsonb
         )
  into v_jobs
  from (
    select id, title, company, location, job_url,
           match_percentage, origin, suspicious, ai_evaluated
    from public.job_results
    where run_id = v_tok.run_id
      and user_id = v_tok.user_id
  ) j;

  -- Feedback this user already gave on this run's jobs (any device, any
  -- channel) so the page renders buttons as already-pressed.
  select coalesce(jsonb_object_agg(g.job_result_id::text, g.types), '{}'::jsonb)
  into v_given
  from (
    select f.job_result_id, jsonb_agg(distinct f.feedback_type) as types
    from public.feedback f
    where f.user_id = v_tok.user_id
      and f.job_result_id in (
        select id from public.job_results
        where run_id = v_tok.run_id and user_id = v_tok.user_id
      )
    group by f.job_result_id
  ) g;

  return jsonb_build_object(
    'ok', true,
    'expires_at', v_tok.expires_at,
    'jobs', v_jobs,
    'given', v_given
  );
end;
$$;


-- ---------- 3. Write RPC: one tap = one append-only feedback row ----------
create or replace function public.submit_email_feedback(
  p_token text,
  p_job_result_id bigint,
  p_feedback_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tok      public.email_feedback_tokens%rowtype;
  v_job      record;
  v_existing bigint;
  v_id       bigint;
begin
  -- Narrower than the feedback table's CHECK on purpose: these are the only
  -- actions the email page offers. wrong_location/other need the app's UI.
  if p_feedback_type is null
     or p_feedback_type not in ('applied', 'bookmarked', 'not_relevant', 'block_company') then
    return jsonb_build_object('ok', false, 'error', 'invalid_type');
  end if;

  if p_token is null or length(p_token) < 20 or length(p_token) > 200 then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select t.* into v_tok
  from public.email_feedback_tokens t
  where t.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;
  if v_tok.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  -- Run-scoped, not just user-scoped: a token can only rate the jobs of the
  -- exact run it was minted for.
  select id, job_url, title, company into v_job
  from public.job_results
  where id = p_job_result_id
    and user_id = v_tok.user_id
    and run_id = v_tok.run_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'job_not_found');
  end if;

  -- Idempotent per (job, type): a refresh / double tap / email-client
  -- prefetch retry must not spam the append-only log or the RAG corpus.
  select f.id into v_existing
  from public.feedback f
  where f.user_id = v_tok.user_id
    and f.job_result_id = p_job_result_id
    and f.feedback_type = p_feedback_type
  limit 1;

  if v_existing is not null then
    return jsonb_build_object('ok', true, 'id', v_existing, 'duplicate', true);
  end if;

  insert into public.feedback
    (user_id, job_result_id, job_url, title, company, feedback_type, note)
  values
    (v_tok.user_id, p_job_result_id, coalesce(v_job.job_url, ''),
     v_job.title, v_job.company, p_feedback_type, null)
  returning id into v_id;

  -- Same UX shortcut as /api/feedback: a bookmark reaction also lands the
  -- job in Tab B. ON CONFLICT no-op keeps re-bookmarking safe.
  if p_feedback_type = 'bookmarked' then
    insert into public.bookmarks (user_id, job_result_id, status)
    values (v_tok.user_id, p_job_result_id, 'saved')
    on conflict (user_id, job_result_id) do nothing;
  end if;

  update public.email_feedback_tokens
  set use_count = use_count + 1, last_used_at = now()
  where id = v_tok.id;

  return jsonb_build_object('ok', true, 'id', v_id, 'duplicate', false);
end;
$$;


-- ---------- 4. Grants: RPCs are the ONLY public surface ----------
revoke execute on function public.email_feedback_jobs(text) from public;
revoke execute on function public.submit_email_feedback(text, bigint, text) from public;
grant execute on function public.email_feedback_jobs(text) to anon, authenticated;
grant execute on function public.submit_email_feedback(text, bigint, text) to anon, authenticated;


-- PostgREST must reload before the RPCs are callable over the Data API.
notify pgrst, 'reload schema';

-- =============================================================
-- END migration 0012
-- =============================================================
