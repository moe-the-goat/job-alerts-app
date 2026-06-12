-- =============================================================
-- Migration 0010 — Repair the feedback -> feedback_embeddings FK
--                  so PostgREST can resolve the embed join used by RAG.
-- Apply once via the Supabase SQL Editor.
--
-- Background: the multi-user worker loads a user's RAG corpus with
-- PostgREST's foreign-key embed syntax:
--
--     supabase.table("feedback")
--       .select("id, feedback_type, title, company, note,
--                feedback_embeddings!inner(embedding)")
--
-- On the 2026-06-11 cutover run this failed at runtime with:
--
--     PGRST200: Could not find a relationship between 'feedback' and
--     'feedback_embeddings' in the schema cache.
--
-- load_feedback_embeddings() degrades to an empty corpus on that error,
-- so RAG retrieval silently returned ZERO past-feedback context — the
-- AI scored every job with no feedback signal even though the run logged
-- "RAG mode (75 feedback entries)". Embeddings themselves inserted fine
-- (the table + 3072-dim column from 0002/0008 exist), so this is purely
-- a missing/undiscovered foreign key + a stale PostgREST schema cache.
--
-- 0002 declared the FK inline:
--     feedback_id bigint primary key references public.feedback(id) ...
-- but PostgREST can't see it (FK never materialized, or the cache was
-- never reloaded after the table was built). This migration makes the
-- relationship explicit, names it deterministically, and forces a cache
-- reload so the embed join resolves.
--
-- Idempotent: drop-if-exists the constraint, re-add it, reload the cache.
-- Safe: an ADD CONSTRAINT on an already-valid column is a metadata-only
-- change; existing rows already satisfy it.
-- =============================================================


-- 1. Make sure the column is the right type to reference feedback.id
--    (bigint). No-op if it already is.
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'feedback_embeddings'
      and column_name  = 'feedback_id'
  ) then
    raise exception
      'feedback_embeddings.feedback_id is missing — apply migration 0002 first.';
  end if;
end $$;


-- 2. Drop any prior FK on feedback_embeddings.feedback_id (whatever its
--    auto-generated name was) so we can re-add it with a stable name that
--    PostgREST will discover. We look the constraint up by column rather
--    than guessing the name.
do $$
declare
  con_name text;
begin
  for con_name in
    select tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema    = kcu.table_schema
    where tc.table_schema   = 'public'
      and tc.table_name     = 'feedback_embeddings'
      and tc.constraint_type = 'FOREIGN KEY'
      and kcu.column_name   = 'feedback_id'
  loop
    execute format(
      'alter table public.feedback_embeddings drop constraint %I', con_name
    );
  end loop;
end $$;


-- 3. Re-add the FK with a deterministic name. This is the relationship
--    PostgREST uses to resolve feedback_embeddings!inner(...) from feedback.
alter table public.feedback_embeddings
  add constraint feedback_embeddings_feedback_id_fkey
  foreign key (feedback_id)
  references public.feedback(id)
  on delete cascade;


-- 4. Force PostgREST to reload its schema cache immediately so the embed
--    join works without waiting for the periodic auto-reload. (Supabase
--    listens for this notification.)
notify pgrst, 'reload schema';


-- =============================================================
-- END migration 0010
-- =============================================================
