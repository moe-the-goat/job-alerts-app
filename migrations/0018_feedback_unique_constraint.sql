-- =============================================================
-- Migration 0018 — Make the feedback one-verdict-per-job constraint usable by
-- the upsert. Apply once via the Supabase SQL Editor.
--
-- Bug: giving feedback failed with
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
--
-- Two causes:
--   1. Migration 0016's index may not have been applied at all.
--   2. Even applied, 0016 created a PARTIAL unique index:
--        create unique index uq_feedback_user_job
--          on public.feedback (user_id, job_result_id)
--          where job_result_id is not null;
--      PostgreSQL's ON CONFLICT (used by Supabase's .upsert()) can only infer a
--      PARTIAL index if the statement also restates the index predicate. The
--      Supabase JS client's `onConflict: "user_id,job_result_id"` names only the
--      columns — it cannot express `WHERE job_result_id IS NOT NULL` — so
--      Postgres can't match it and rejects the upsert.
--
-- Fix: replace the partial index with a PLAIN unique constraint on
-- (user_id, job_result_id). The /api/feedback route always sends a positive
-- integer job_result_id (it rejects null / <= 0), so the table never gets a
-- NULL job_result_id from the app, and a full constraint is safe. A real
-- UNIQUE CONSTRAINT (not just an index) is what ON CONFLICT matches cleanly.
--
-- Idempotent: drop the old index if present, add the constraint only if absent.
-- Safe: the collapse-duplicates step from 0016 already made the data unique; if
-- 0016 never ran, we collapse here too before adding the constraint.
-- =============================================================


-- ---------- 1. Collapse any duplicate (user_id, job_result_id) rows ----------
-- Keep the most recent per (user, job); delete older ones. No-op if already
-- unique. (Repeats 0016 step 1 so this migration is safe to run standalone.)
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


-- ---------- 2. Drop the unusable partial index from 0016 ----------
drop index if exists public.uq_feedback_user_job;


-- ---------- 3. Add a plain unique CONSTRAINT the upsert can match ----------
-- A named constraint (not just an index) is what ON CONFLICT (user_id,
-- job_result_id) resolves to. NULL job_result_id values (none from the app) are
-- treated as distinct by SQL, so legacy/orphaned rows never collide — fine.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'feedback_user_job_unique'
      and conrelid = 'public.feedback'::regclass
  ) then
    alter table public.feedback
      add constraint feedback_user_job_unique unique (user_id, job_result_id);
  end if;
end $$;


-- ---------- 4. Make sure the UPDATE grant from 0016 is in place ----------
-- (The upsert's conflict path is an UPDATE; the table was insert-only originally.)
grant update on public.feedback to authenticated;


-- PostgREST cache reload so the new constraint is visible to the Data API.
notify pgrst, 'reload schema';

-- =============================================================
-- END migration 0018
-- =============================================================
