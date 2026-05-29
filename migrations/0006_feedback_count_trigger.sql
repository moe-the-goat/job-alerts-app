-- =============================================================
-- Migration 0006 — Keep profiles.feedback_count honest.
-- Apply once via the Supabase SQL Editor.
--
-- Background: profiles.feedback_count (added in 0002) is a
-- denormalized counter meant for a fast "have we crossed the RAG
-- threshold?" check. Nothing was incrementing it — the /api/feedback
-- route only INSERTs into feedback, and the worker / B9a migration
-- insert feedback rows via service_role. The column sat at 0 forever.
--
-- Impact of leaving it broken: the multi-user runner is unaffected
-- (it counts feedback rows directly), but the per-user digest cron
-- reads this counter to decide when to STOP — so it would keep
-- regenerating an unused candidate_preferences profile past the
-- threshold, burning LLM tokens.
--
-- Fix here is a TRIGGER, not route logic, on purpose: feedback rows
-- arrive from three sources (the Next.js route, the B9a data-migration
-- script, and potentially the worker). A trigger keeps the counter
-- correct regardless of who inserts, atomically with the insert.
--
-- The feedback table is append-only (no UPDATE/DELETE per its 0002
-- grants), so an INSERT-only trigger fully covers the lifecycle.
--
-- Idempotent: re-applying is safe (drop-if-exists + create-or-replace
-- + a backfill that SETs the absolute count rather than adding to it).
-- =============================================================


-- ---------- 1. Trigger function: bump the counter on each insert ----------
-- security definer so it can write profiles regardless of the caller's RLS
-- (the authenticated user can only INSERT feedback, not UPDATE profiles.feedback_count
-- directly — we don't want to grant that and let clients forge the count).
create or replace function public.bump_feedback_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set feedback_count = feedback_count + 1
   where user_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists feedback_count_after_insert on public.feedback;
create trigger feedback_count_after_insert
  after insert on public.feedback
  for each row execute function public.bump_feedback_count();


-- ---------- 2. One-time backfill ----------
-- Reconcile the counter with reality for any feedback that already exists
-- (e.g. rows landed before this migration, or the B9a migration ran first).
-- SET (not +=) so re-running this migration is idempotent: it always lands
-- on the true count, never double-adds.
update public.profiles p
   set feedback_count = coalesce(c.cnt, 0)
  from (
    select user_id, count(*) as cnt
      from public.feedback
     group by user_id
  ) c
 where p.user_id = c.user_id
   and p.feedback_count is distinct from c.cnt;

-- Zero out any profile with no feedback rows but a stale non-zero counter.
update public.profiles p
   set feedback_count = 0
 where p.feedback_count <> 0
   and not exists (
     select 1 from public.feedback f where f.user_id = p.user_id
   );


-- =============================================================
-- END migration 0006
-- =============================================================
