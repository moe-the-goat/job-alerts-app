-- =============================================================
-- Migration 0007 — Capture first / last name on profiles.
-- Apply once via the Supabase SQL Editor.
--
-- Background: 0001 shipped a profiles.display_name column that
-- nothing ever wrote or read, and signup only collected email +
-- password — so no human name was stored anywhere. This adds
-- first_name / last_name and teaches the existing signup trigger
-- to populate them (plus a derived display_name) from the metadata
-- the signup form now sends.
--
-- The name arrives via auth signUp options.data, which Supabase
-- stores on auth.users.raw_user_meta_data BEFORE email confirmation,
-- and the on_auth_user_created trigger (0001) fires at that insert —
-- so the names are available to the trigger at signup time.
--
-- Idempotent: add-column-if-not-exists + create-or-replace function.
-- =============================================================


-- ---------- 1. Columns ----------
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name  text;


-- ---------- 2. Repopulate the signup trigger ----------
-- Replaces the 0001 version that inserted only user_id. Reads the
-- first/last name from signup metadata, trims them, and derives
-- display_name as "First Last" (null when neither is present, e.g. a
-- user provisioned via the admin API without metadata).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first   text := nullif(trim(coalesce(new.raw_user_meta_data->>'first_name', '')), '');
  v_last    text := nullif(trim(coalesce(new.raw_user_meta_data->>'last_name',  '')), '');
  v_display text := nullif(trim(concat_ws(' ', v_first, v_last)), '');
begin
  insert into public.profiles (user_id, first_name, last_name, display_name)
  values (new.id, v_first, v_last, v_display);
  return new;
end;
$$;

-- Trigger definition itself is unchanged from 0001 (still AFTER INSERT
-- on auth.users → handle_new_user); only the function body changed.


-- =============================================================
-- END migration 0007
-- =============================================================
