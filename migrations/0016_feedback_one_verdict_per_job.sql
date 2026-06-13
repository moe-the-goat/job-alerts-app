-- =============================================================
-- Migration 0016 — One feedback verdict per (user, job).
-- Apply once via the Supabase SQL Editor.
--
-- Background: the feedback table was built append-only (migration 0002:
-- "Each click = one row"). In the email flow that was fine — the RPC
-- deduped per (user, job, TYPE). But the dashboard's /api/feedback route
-- did a plain INSERT with no dedup at all, so a user could stack several
-- DIFFERENT reactions on the same job: e.g. 'applied' + 'not_relevant' +
-- 'other' all land as separate rows.
--
-- Why that's a bug, not just clutter:
--   * The worker embeds EVERY feedback row into the RAG corpus
--     (core_feedback_supabase.load_feedback_embeddings). Contradictory
--     rows on one job train tomorrow's scoring in opposite directions.
--   * profiles.feedback_count (bumped per-insert by migration 0006) is
--     inflated — 3 taps on 1 job count as 3 entries, prematurely flipping
--     the user from digest mode into RAG mode.
--
-- New model: ONE verdict per (user, job). The latest reaction wins. Both
-- write paths (the /api/feedback upsert and the submit_email_feedback RPC)
-- now replace the existing row instead of appending.
--
-- This migration:
--   1. Collapses existing duplicates — keeps the most recent feedback row
--      per (user, job), deletes the older ones (their embeddings cascade).
--   2. Adds a partial unique index on (user_id, job_result_id) so upserts
--      have a conflict target. Partial because job_result_id is nullable
--      (FK is ON DELETE SET NULL) — orphaned-job rows shouldn't collide.
--   3. Grants UPDATE to authenticated so the route's upsert conflict path
--      works (the table was insert-only by the old contract).
--   4. Reworks the feedback_count trigger to track DISTINCT judged jobs:
--      decrement on DELETE, and recompute the absolute count as a backfill.
--   5. Rewrites submit_email_feedback to replace any existing row for the
--      job (any type), not just dedup the same type.
--
-- Idempotent: re-applying is safe (dedup is a no-op once unique, the index
-- uses IF NOT EXISTS, the grant/trigger/function are create-or-replace).
-- =============================================================


-- ---------- 1. Collapse existing duplicates (keep the most recent) ----------
-- For each (user_id, job_result_id) with job_result_id NOT NULL, keep the
-- row with the latest submitted_at (ties broken by highest id) and delete
-- the rest. feedback_embeddings rows cascade-delete via their FK (0010).
delete from public.feedback f
using (
  select id,
         row_number() over (
           partition by user_id, job_result_id
           order by submitted_at desc, id desc
         ) as rn
  from public.feedback
  where job_result_id is not null
) ranked
where f.id = ranked.id
  and ranked.rn > 1;


-- ---------- 2. Partial unique index = the upsert conflict target ----------
create unique index if not exists uq_feedback_user_job
  on public.feedback (user_id, job_result_id)
  where job_result_id is not null;


-- ---------- 3. Grant UPDATE so the upsert's conflict path works ----------
-- The table was insert-only by the old append contract; the one-verdict
-- model needs to overwrite the existing row in place.
grant update on public.feedback to authenticated;

comment on table public.feedback is
  'One AI-training verdict per (user, job) — the latest reaction wins. '
  'Embedded into feedback_embeddings for RAG. Both the /api/feedback upsert '
  'and submit_email_feedback replace the existing row rather than appending.';


-- ---------- 4. Keep feedback_count = distinct judged jobs ----------
-- The INSERT-bump (0006) stays correct: an upsert that hits the conflict
-- becomes an UPDATE, so no INSERT fires and the count doesn't grow when a
-- user re-judges a job. We add a DELETE decrement (for the collapse above
-- and any future deletes) and re-backfill the absolute count.
create or replace function public.drop_feedback_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set feedback_count = greatest(feedback_count - 1, 0)
   where user_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists feedback_count_after_delete on public.feedback;
create trigger feedback_count_after_delete
  after delete on public.feedback
  for each row execute function public.drop_feedback_count();

-- Reconcile to the true row count (= distinct judged jobs now that the
-- table is unique per job). SET, not +=, so re-running stays idempotent.
update public.profiles p
   set feedback_count = coalesce(c.cnt, 0)
  from (
    select user_id, count(*) as cnt
      from public.feedback
     group by user_id
  ) c
 where p.user_id = c.user_id
   and p.feedback_count is distinct from c.cnt;

update public.profiles p
   set feedback_count = 0
 where p.feedback_count <> 0
   and not exists (
     select 1 from public.feedback f where f.user_id = p.user_id
   );


-- ---------- 5. Email RPC: replace the job's verdict, don't stack ----------
-- Was: dedup per (user, job, TYPE) — a different type appended a new row.
-- Now: one row per (user, job). If a row exists for this job (any type),
-- UPDATE its type + note in place; otherwise insert.
create or replace function public.submit_email_feedback(
  p_token text,
  p_job_result_id bigint,
  p_feedback_type text,
  p_note text default null
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
  v_note     text;
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

  -- Trim, null out blanks, and cap length so a runaway paste can't bloat the
  -- row or the embedding text. 500 chars is plenty for "why I rated this".
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and length(v_note) > 500 then
    v_note := left(v_note, 500);
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

  -- One verdict per (user, job): if a row already exists for this job —
  -- ANY type — update its type + note in place rather than appending a
  -- contradictory second row. The latest reaction wins. A note backfills
  -- only when one is supplied (don't clobber an existing note with null).
  select f.id into v_existing
  from public.feedback f
  where f.user_id = v_tok.user_id
    and f.job_result_id = p_job_result_id
  limit 1;

  if v_existing is not null then
    update public.feedback
    set feedback_type = p_feedback_type,
        note = coalesce(v_note, note),
        submitted_at = now()
    where id = v_existing;

    -- Mirror the insert path's bookmark shortcut for a switch-to-bookmark.
    if p_feedback_type = 'bookmarked' then
      insert into public.bookmarks (user_id, job_result_id, status)
      values (v_tok.user_id, p_job_result_id, 'saved')
      on conflict (user_id, job_result_id) do nothing;
    end if;

    update public.email_feedback_tokens
    set use_count = use_count + 1, last_used_at = now()
    where id = v_tok.id;

    return jsonb_build_object('ok', true, 'id', v_existing, 'duplicate', true);
  end if;

  insert into public.feedback
    (user_id, job_result_id, job_url, title, company, feedback_type, note)
  values
    (v_tok.user_id, p_job_result_id, coalesce(v_job.job_url, ''),
     v_job.title, v_job.company, p_feedback_type, v_note)
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

revoke execute on function public.submit_email_feedback(text, bigint, text, text) from public;
grant execute on function public.submit_email_feedback(text, bigint, text, text) to anon, authenticated;


-- PostgREST must reload before the rewritten RPC + new grant take effect.
notify pgrst, 'reload schema';

-- =============================================================
-- END migration 0016
-- =============================================================
