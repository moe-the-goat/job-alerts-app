-- =============================================================
-- Migration 0003 — Storage bucket for CV uploads.
-- Apply once via the Supabase SQL Editor.
--
-- What this does:
--   1. Creates the private `cvs` bucket.
--   2. Locks it down so each user can only read / write objects under
--      their own `{user_id}/...` prefix via Storage RLS policies.
--   3. Caps uploads at 5 MB and restricts mime types to PDF / DOCX —
--      defense-in-depth on top of the application-layer validation in
--      `uploadCvAction` (src/app/actions/cv.ts).
--
-- The application uploads CVs to path `{user_id}/cv.{pdf|docx}` using
-- the user's anon-key session — RLS handles authorization.
--
-- Idempotent: every statement uses ON CONFLICT / DROP IF EXISTS.
-- =============================================================


-- ---------- 1. Create the bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cvs',
  'cvs',
  false,
  5242880,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ---------- 2. RLS policies — own-folder access only ----------
-- Path convention: `{user_id}/cv.pdf` or `{user_id}/cv.docx`.
-- storage.foldername(name) returns the path segments as a text[]
-- so [1] = "{user_id}".

drop policy if exists cv_own_folder_select on storage.objects;
drop policy if exists cv_own_folder_insert on storage.objects;
drop policy if exists cv_own_folder_update on storage.objects;
drop policy if exists cv_own_folder_delete on storage.objects;

create policy cv_own_folder_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy cv_own_folder_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy cv_own_folder_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy cv_own_folder_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- =============================================================
-- END migration 0003
-- =============================================================
