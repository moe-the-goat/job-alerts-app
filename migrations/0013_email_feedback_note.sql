-- =============================================================
-- Migration 0013 — Optional note on email feedback (extends W2).
--
-- The legacy feedback page (core_feedback_page.py) let a user attach a
-- free-text "note explaining your choice" to each reaction, and that
-- note is folded into the RAG embedding text — so it trains the AI. The
-- multi-user email page (/f/<token>, migration 0012) shipped one-tap-only
-- and dropped the note: submit_email_feedback hardcoded note = null.
--
-- This migration re-adds the capability by giving the write RPC an
-- optional p_note parameter. Everything else about the W2 security model
-- is unchanged.
--
-- Backwards compatible: p_note has a default, so the old 3-arg call
-- signature still resolves. The currently-deployed API route (which
-- sends no note) keeps working through a migrate-then-deploy window.
--
-- Idempotent: CREATE OR REPLACE; re-applying is safe.
-- =============================================================


-- ---------- Write RPC: one tap = one append-only feedback row, now with an optional note ----------
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

  -- Idempotent per (job, type): a refresh / double tap / email-client
  -- prefetch retry must not spam the append-only log or the RAG corpus.
  -- If the row already exists but arrived without a note, let a later
  -- submission backfill the note rather than silently discarding it.
  select f.id into v_existing
  from public.feedback f
  where f.user_id = v_tok.user_id
    and f.job_result_id = p_job_result_id
    and f.feedback_type = p_feedback_type
  limit 1;

  if v_existing is not null then
    if v_note is not null then
      update public.feedback
      set note = v_note
      where id = v_existing and (note is null or note = '');
    end if;
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


-- ---------- Grants: the new 4-arg overload needs its own grant ----------
-- (CREATE OR REPLACE with a new default arg registers a distinct signature;
--  re-grant so anon/authenticated can call the 4-arg form over the Data API.)
revoke execute on function public.submit_email_feedback(text, bigint, text, text) from public;
grant execute on function public.submit_email_feedback(text, bigint, text, text) to anon, authenticated;


-- PostgREST must reload before the new signature is callable over the Data API.
notify pgrst, 'reload schema';

-- =============================================================
-- END migration 0013
-- =============================================================
