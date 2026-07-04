-- =============================================================
-- Migration 0027 — optional public-GitHub signal (Tier 6a).
--
-- `github_username` is the user's public GitHub handle (opt-in). `github_summary`
-- is a short, app-built digest of their public repos (top languages + project
-- blurbs) computed once when they connect, so the worker never has to hit the
-- GitHub API per run — it just appends this text to the CV for embedding + scoring.
-- Both nullable / empty by default (behavior unchanged until a user connects).
-- Idempotent.
-- =============================================================

alter table public.profiles
  add column if not exists github_username text,
  add column if not exists github_summary text;
