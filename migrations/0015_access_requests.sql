-- =============================================================
-- Migration 0015 — Access requests (closed-beta admin approval gate).
--
-- The app is a closed beta (~5 users). Instead of letting anyone sign
-- up, the signup form now files an ACCESS REQUEST: a pending row + an
-- email to the admin with the applicant's name/email (never a password).
-- The admin approves or rejects; on approval the real Supabase account
-- is created via an invite link (the user sets their password + verifies
-- in one step), on rejection the user gets a polite decline email.
--
-- This table holds ONLY the request + its decision. No password is ever
-- stored (the invite flow has the user set it after approval). The
-- decision_token_hash is the sha256 of a one-time secret embedded in the
-- admin's Approve/Reject email links — same hash-only pattern as the
-- email_feedback_tokens table (migration 0012): the raw token never
-- touches the database.
--
-- RLS: the table is service-role-only. Anon/authenticated cannot read or
-- write it at all — signup writes via the service-role admin client in a
-- server action, and decisions run server-side too.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE.
-- =============================================================


create table if not exists public.access_requests (
  id                   bigserial primary key,
  email                text        not null,
  first_name           text        not null,
  last_name            text        not null,
  status               text        not null default 'pending'
                         check (status in ('pending', 'approved', 'rejected')),
  -- sha256 hex of the one-time secret in the admin's decision links.
  decision_token_hash  text        not null unique,
  -- Free-form context the applicant optionally provided ("why I want in").
  note                 text,
  created_at           timestamptz not null default now(),
  decided_at           timestamptz,
  -- Which auth user the approval created (audit; null until approved).
  created_user_id      uuid
);

comment on table public.access_requests is
  'Closed-beta access requests. Signup files a pending row; admin approves '
  '(invite sent) or rejects. Service-role only — no anon/authenticated access. '
  'No password is ever stored here (invite flow sets it post-approval).';

-- One LIVE request per email: a person can re-apply only after a prior
-- request is decided. A partial unique index keeps 'pending' unique while
-- allowing historical approved/rejected rows for the same email.
create unique index if not exists uq_access_requests_pending_email
  on public.access_requests (lower(email))
  where status = 'pending';

create index if not exists idx_access_requests_status
  on public.access_requests (status, created_at desc);

alter table public.access_requests enable row level security;
-- Deliberately NO policies: only the service-role key (server actions) can
-- touch this table. The signup form and admin decisions all run server-side.
revoke all on table public.access_requests from anon, authenticated;
