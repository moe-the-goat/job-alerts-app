# Cutover fixes — runbook (2026-06-11 multi-user run findings)

Apply these in order in the **Supabase SQL Editor** (they need the database, and
the service-role key never leaves Supabase). Each is idempotent — safe to re-run.

The 2026-06-11 cutover run (`27382628573`) succeeded and persisted data, but the
deep audit found: RAG retrieved nothing (missing FK), the cross-run semantic
dedup table was missing, and the email went to the wrong address under Resend
test mode. These fixes close all of that.

---

## Step 1 — Repair RAG (feedback ↔ feedback_embeddings FK)

**Why:** `load_feedback_embeddings` failed with PGRST200 ("no relationship in
schema cache"), so RAG ran with an empty corpus. The AI scored every job with
no feedback signal despite logging "RAG mode (75 entries)".

**Run:** `migrations/0010_fix_feedback_embeddings_fk.sql`

**Verify (run after):**
```sql
-- The FK should now exist with this name:
select conname
from pg_constraint
where conrelid = 'public.feedback_embeddings'::regclass
  and contype  = 'f';
-- expect: feedback_embeddings_feedback_id_fkey

-- And the embed join PostgREST uses should resolve:
select id, feedback_embeddings!inner(feedback_id)
from feedback
limit 1;
-- expect: one row, no PGRST200 error
```

---

## Step 2 — Create the job_embeddings table (cross-run semantic dedup)

**Why:** the worker logged PGRST205 ("table public.job_embeddings not found").
Migration 0009 was written but never applied to the live DB, so cross-run
"same job, new URL" dedup silently did nothing and the save-back failed.

**Run:** `migrations/0009_job_embeddings.sql` (now ends with a schema-cache reload)

**Verify (run after):**
```sql
select to_regclass('public.job_embeddings');   -- expect: public.job_embeddings (not null)
```

---

## Step 3 — Fix the notification email

**Why:** the run tried to send to a different address than
`mohaabuhijleh@gmail.com`, and Resend is in **test mode** (no verified domain),
which only permits delivery to `mohaabuhijleh@gmail.com`. Result: 403, no email.

**Option A (fastest — make the test-mode address the recipient).**
Use this to confirm email works end-to-end right now:
```sql
update public.preferences p
set notification_email = 'mohaabuhijleh@gmail.com'
from auth.users u
where p.user_id = u.id
  and u.email = 'mohaabuhijleh@gmail.com';   -- your auth login email

-- Verify:
select user_id, notification_email
from public.preferences
where user_id = '6e1f3ba8-88a2-47b2-9f33-77e0033159e8';
-- expect: notification_email = mohaabuhijleh@gmail.com
```

**Option B (proper — keep your real address, lift the test-mode limit).**
Required anyway before sending to the 5 friends:
1. Verify a domain at https://resend.com/domains
2. Change the worker's `from:` address to one on that domain
   (env/secret used by `pipeline/core_email_resend.py`).
3. Leave `notification_email` as your real address.

Do **A now** to prove the pipeline, then **B** before onboarding others.

---

## Step 4 — Re-run and confirm

After Steps 1–3, trigger one manual run with email on:
```
gh workflow run multi_user.yml \
  -f dry_run=false \
  -f user_id=6e1f3ba8-88a2-47b2-9f33-77e0033159e8 \
  -f skip_due_check=true
```

In the new run's log, confirm the three failures are gone:
- NO "Could not find a relationship between 'feedback' and 'feedback_embeddings'"
- NO "Could not find the table 'public.job_embeddings'"
- A successful Resend send (not a 403), and the email arrives.

---

## Not a bug — reputation 55% cap

The audit also checked the 55% cap. It is working as designed:
- Blacklisted companies are **dropped at the viability pre-screen**
  ("blacklisted by reputation list") before AI scoring — stronger than capping.
- The `55%` seen on "Junior Data Scientist" was the **suspicious self-cap**
  (`match=55% ... SUSPICIOUS`) firing correctly.
- The cap path (`apply_post_ai_caps`) is wired into the multi-user runner via
  `evaluate_job_with_ai`. No change needed.

---

## Environmental (not fixed in code) — CI web-search rate limits

Brave/Mojeek/Google/jobs.ps returned 429/403 from the GitHub runner IP, so the
DDG local source contributed 0 this run and some "deep web search"
enrichments timed out. The API sources (ATS, JobSpy, Telegram) still worked
(40 raw local jobs). If this recurs, route web search through the Google
Programmable Search API key (already configured) instead of scraped engines.
