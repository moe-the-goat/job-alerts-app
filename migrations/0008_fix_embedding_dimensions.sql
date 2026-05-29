-- =============================================================
-- Migration 0008 — Correct feedback_embeddings vector dimensions.
-- Apply once via the Supabase SQL Editor.
--
-- Background: 0002 declared feedback_embeddings.embedding as
-- vector(768), but the worker embeds feedback with
-- FEEDBACK_EMBED_MODEL = "gemini-embedding-2", which returns 3072-dim
-- vectors. Every embedding insert therefore failed the cast
-- ("expected 768 dimensions, not 3072") — in the B9a data migration
-- AND on every runtime ensure_feedback_embeddings() call. Feedback rows
-- still landed; only their embeddings were dropped.
--
-- This widens the column to vector(3072) to match the model. We also
-- DROP the ivfflat index 0002 created: pgvector's ivfflat (and hnsw)
-- cap out at 2000 dimensions, so it can't cover a 3072-dim column — and
-- retrieval doesn't need it. retrieve_relevant_feedback() pulls a
-- user's vectors and ranks them in Python (brute-force cosine), which
-- is the right call at the per-user corpus sizes here (hundreds, not
-- millions). The per-user b-tree index (idx_feedback_embeddings_user)
-- stays and is what actually scopes the read.
--
-- Safe: feedback_embeddings currently holds no rows (every prior insert
-- failed), so the type change is an instant, lossless rewrite.
-- Idempotent: drop-if-exists + alter-to-target-type.
-- =============================================================


-- 1. Drop the ivfflat index — invalid for >2000 dims, and unused by the code.
drop index if exists public.idx_feedback_embeddings_vec;

-- 2. Widen the embedding column to match gemini-embedding-2 (3072 dims).
alter table public.feedback_embeddings
  alter column embedding type vector(3072);


-- =============================================================
-- END migration 0008
-- =============================================================
