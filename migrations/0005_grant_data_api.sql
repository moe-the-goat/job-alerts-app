-- =============================================================
-- Migration 0005 — Explicit Data API GRANTs.
-- Apply once via the Supabase SQL Editor.
--
-- Background: starting Oct 30, 2026, Supabase will stop auto-
-- exposing public-schema tables to PostgREST / GraphQL / supabase-js
-- for newly created tables in existing projects. (For brand-new
-- projects the cutoff was May 30, 2026.) This migration makes the
-- access our app already relies on explicit, so:
--   1. the rollout is a no-op for this project on Oct 30, and
--   2. the migrations work on fresh installs.
--
-- RLS still enforces row-level access; these GRANTs only open the
-- table itself to the API. Worker writes happen via service_role,
-- which bypasses RLS and grants by design.
--
-- Idempotent: GRANT is a no-op when the privilege already exists.
-- =============================================================


-- ---------- 1. Tables the end-user reads + writes directly ----------
-- profiles: trigger inserts on signup; users update their own row;
--           cascade-deletion via auth.users → no DELETE grant needed.
grant select, insert, update on public.profiles to authenticated;

grant select, insert, update, delete on public.preferences   to authenticated;
grant select, insert, update, delete on public.search_queries to authenticated;
grant select, insert, update, delete on public.bookmarks      to authenticated;

-- feedback is append-only: SELECT (own rows via RLS) + INSERT.
-- No UPDATE / DELETE — the table is a historical record.
grant select, insert on public.feedback to authenticated;


-- ---------- 2. Tables the end-user reads only ----------
-- All writes happen via the worker's service_role key.
grant select on public.runs                to authenticated;
grant select on public.seen_jobs           to authenticated;
grant select on public.job_results         to authenticated;
grant select on public.feedback_embeddings to authenticated;
grant select on public.reputation          to authenticated;


-- ---------- 3. Sequences for the user-writable bigserial PKs ----------
-- Required so an INSERT from the user can advance the sequence.
grant usage on sequence public.search_queries_id_seq to authenticated;
grant usage on sequence public.feedback_id_seq       to authenticated;
grant usage on sequence public.bookmarks_id_seq      to authenticated;


-- =============================================================
-- END migration 0005
-- =============================================================
