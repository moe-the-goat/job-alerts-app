# Migrations

SQL migrations for the Supabase project that backs this app. Apply in
numeric order via the Supabase SQL Editor on a fresh project, or one at a
time as new ones are added.

Every migration is **idempotent** — re-applying it on a database that's
already up-to-date is a no-op. Re-applying out of order is generally safe;
the only ordering that matters is that 0001 runs before 0002, since 0002
extends tables 0001 creates.

## Conventions

- One concern per file, numbered `NNNN_short_description.sql`.
- `IF NOT EXISTS` / `DROP ... IF EXISTS` on every statement so re-application
  is safe.
- Every public table:
  - `enable row level security`,
  - has an `auth.uid() = user_id`-style policy,
  - has an explicit `grant ... to authenticated` line — Supabase will stop
    auto-granting these on October 30, 2026 (see [0005](0005_grant_data_api.sql)).
- Worker writes use the `service_role` key, which bypasses RLS by design.
- GDPR-compliant `on delete cascade` from `auth.users` → `profiles` → every
  per-user table.

## Manifest

| File                                       | Purpose                                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [0001_initial_schema.sql](0001_initial_schema.sql)                       | Base tables: profiles, preferences, search_queries, runs, seen_jobs, job_results, feedback (v1) |
| [0002_multi_user_tabs.sql](0002_multi_user_tabs.sql)                     | Tab A/B: pgvector, append-only feedback rebuild, feedback_embeddings, bookmarks, reputation     |
| [0003_cv_storage.sql](0003_cv_storage.sql)                               | `cvs` Storage bucket with per-user folder RLS                                                   |
| [0004_search_queries_updated_at.sql](0004_search_queries_updated_at.sql) | Adds `updated_at` + touch trigger + index for stable sort                                       |
| [0005_grant_data_api.sql](0005_grant_data_api.sql)                       | Explicit Data API GRANTs ahead of Supabase's Oct-30-2026 default change                         |
| [0006_feedback_count_trigger.sql](0006_feedback_count_trigger.sql)       | Trigger + backfill so `profiles.feedback_count` stays honest on every feedback insert           |

## Adding a new migration

1. Create `NNNN_description.sql` with the next number.
2. Make every statement idempotent.
3. Include `grant ... to authenticated` and (for any new bigserial PK)
   `grant usage on sequence ... to authenticated` so the table is reachable
   via the Data API. Without these, PostgREST / supabase-js will 404 on
   the new table after Oct 30, 2026.
4. Add a row to the manifest table above.
