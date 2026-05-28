# Job Alerts — Web App

A multi-user web frontend for an AI job-scoring pipeline. People sign up, upload a CV, configure search preferences, and every morning an AI scores nine job boards against their CV and delivers a short, honest shortlist to their inbox — and to a personal dashboard where they can react, bookmark, and track applications. Their reactions tune tomorrow's picks.

The Python pipeline that actually scrapes, scores, and emails lives in its own repo: [`Automated-AI-Job-Intelligence-System`](https://github.com/moe-the-goat/Automated-AI-Job-Intelligence-System). That repo is the single-user version I built first, for myself. This repo is the multi-user surface — what turns the personal tool into something my friends in the same job hunt can use without me sitting next to them.

This repository is what makes it usable.

---

## Overview

A new user lands on the marketing page, sees the dual-surface promise (same picks, in your inbox and on your dashboard), clicks **Get my morning**, signs up with an email and password, and verifies through a Supabase email link. They get walked through a two-step onboarding: upload a CV (PDF or DOCX, parsed server-side to plaintext and saved against their profile), then configure preferences — notification email, delivery cadence, and at least one search query naming the job board, location, role title, and remote eligibility. The moment all three pieces are in place, the dashboard's onboarding strip collapses and the workspace unlocks.

After that, the multi-user worker (a Python service in the worker repo) starts including them in its hourly cron. For every active user whose `next_run_at` has passed, the worker reads their CV text and search preferences from Supabase, runs the existing pipeline against them, writes the run summary to `runs` and the scored jobs to `job_results`, and sends the morning email via Resend. The user opens the dashboard and finds the same picks waiting in **Tab A — Feedback**, where they can mark each job as Applied, Bookmark, Not for me, Block company, Wrong location, or Other. Bookmarks flow into **Tab B — Tracker**, a private application kanban with six pipeline columns from Saved through Offer.

Every reaction is appended to a feedback table and embedded into a per-user RAG corpus. A separate periodic digest compresses the rolling log into a short preference profile that the verdict LLM reads on the next run — so tomorrow's picks reflect what they actually applied to yesterday.

Inside this repo there are nine route segments under `src/app/`, eleven UI primitives + layout components, three feature-scoped server-action modules, five idempotent SQL migrations, **61 tests across 9 files**, and a four-stage QA gate that runs on every push. The rest of this document is a tour of why each piece is shaped the way it is.

---

## The Problem It Solves

The single-user pipeline already works. It runs every morning on free infrastructure, costs zero dollars to operate, and has shipped one job email per day for months. The problem it doesn't solve is: how do other people use it?

The natural answer — "fork the repo, configure your secrets, add your CV, schedule the workflow" — is a non-answer. It assumes a level of comfort with GitHub Actions, environment variables, and CI/CD that excludes everyone the tool is supposed to help. My friends in the same job hunt don't run cron jobs. They open an email, scan it, and close it. The cron job and the AI prompt are implementation details to them.

The deeper observation: multi-tenancy is its own engineering problem. Adding a `user_id` column to every table doesn't make a single-user system multi-user — it makes a broken single-user system that leaks data between accounts. Real multi-tenancy needs row-level security at the database layer, scoped mutations at the application layer, isolated storage paths for uploaded files, and a session model that survives middleware refresh. None of those are things you bolt on after the fact.

This repository is the answer. It assumes the user knows nothing about the pipeline beneath it, exposes every piece of configuration as a UI control, and enforces tenant isolation at every layer the request can pass through — Supabase RLS policies, server-action `eq("user_id", user.id)` filters even when RLS would already do it, per-user folder paths in Storage with their own RLS, and an SSR session model that refreshes cookies on every request.

---

## How It Works

At the highest level, the app is a four-stage pipeline that closes back through the worker:

```
   sign up + verify (Supabase Auth)
            |
            v
   onboarding gate
   (CV upload + preferences + at least one active search)
            |
            v
   dashboard unlock (Tab A / Tab B)
            |
            v
   worker reads active users from Supabase, runs the pipeline per-user
   (cron in the worker repo, writes job_results + runs)
            |
            v
   user reads morning email + reacts in Tab A
            |
            v
   feedback → embeddings → next-run prompt (per-user RAG)
```

Each stage exists because the previous one couldn't be skipped. The onboarding gate exists because a user without a CV can't be scored, a user without preferences has no email to deliver to, and a user without an active search yields zero jobs. The worker stays in its own repo because it's a long-running Python process with a different deployment model than the web app. The reactions feed back through embeddings because the AI prompt has limited context and needs a compressed view of each user's history.

**Stage 1 — Auth + email verification.** Standard Supabase Auth. Sign-up generates a verification email whose link routes through `/auth/callback`, where the code is exchanged for a session and the user is redirected to `/dashboard`. Password reset uses the same callback with `next=/auth/reset-password`. A Supabase trigger creates a matching `profiles` row on every `auth.users` insert, so the rest of the app can rely on it existing.

**Stage 2 — Onboarding.** Two steps, gated by [`requireReady`](src/app/dashboard/_lib/dashboard-state.ts). The CV upload at `/onboarding/cv` accepts PDF or DOCX (5 MB cap), parses text server-side via `pdf-parse` or `mammoth`, validates that we extracted at least 200 characters (scanned PDFs fail this and fall through to a manual paste textarea), and saves the file to per-user folder `cvs/{user_id}/cv.{ext}` in Supabase Storage. The preferences page at `/preferences` is two sections: delivery (email, frequency picker, active toggle) and searches (cards with inline edit). Each search has a search term, location, sites (LinkedIn / Indeed / Glassdoor / ZipRecruiter / Google as toggleable chips), job type, remote eligibility, and per-search recency window. A user can have any number of searches.

**Stage 3 — Dashboard unlock.** Once CV + preferences + at least one active search are all in place AND the user hasn't paused the pipeline, the onboarding strip on `/dashboard` collapses and the page redirects to `/dashboard/feedback`. Both tab routes (`/feedback`, `/tracker`) live under a Next.js route group `(workspace)` that shares one layout — the workspace shell, with tab navigation, a last-run stats strip, and a right rail with quick actions and account summary. The shared dashboard state loader is wrapped in `React.cache` so the layout and tab page share one query batch per request.

**Stage 4 — Worker run.** The worker (running on the worker repo's cron) reads `preferences WHERE is_active AND next_run_at <= now()`, builds a config object per user from their preferences + CV text, runs the existing single-user pipeline against them, writes the run summary to `runs` and each scored job to `job_results`, sends the email via Resend, and updates `next_run_at`. None of this is in this repo; the web app's only job here is to expose the data the worker produced through Tab A.

**Stage 5 — Feedback loop.** Reactions in Tab A POST to `/api/feedback`, which INSERTs into `feedback` and enqueues an embedding job. A background process embeds each feedback row using Gemini Embedding 2 and writes the vector to `feedback_embeddings` (pgvector, ivfflat index for per-user similarity search). The next pipeline run reads the closest matches to the candidate job, compresses them into a short preference profile, and injects that into the verdict prompt. Feedback is append-only — every click is a new row, never an update, so the historical record stays intact.

That is the system, end to end. The next section is the deep tour.

---

## The Web App in Detail

<details>
<summary><strong>Auth — Supabase SSR with cookie refresh on every request</strong></summary>

Auth is handled by `@supabase/ssr` with three thin pieces: a browser client for client components ([`src/lib/supabase/client.ts`](src/lib/supabase/client.ts)), a server client for server components and server actions ([`src/lib/supabase/server.ts`](src/lib/supabase/server.ts)), and a Next.js middleware (called `proxy.ts` per Next 16's rename) that refreshes the session cookie on every request before the page renders ([`src/lib/supabase/middleware.ts`](src/lib/supabase/middleware.ts) implements `updateSession`, called from [`src/proxy.ts`](src/proxy.ts)).

Three flows route through `/auth/callback`: email verification on signup, password-reset link clicks, and any third-party OAuth provider added later. The handler is one route — it exchanges the `code` query param for a session and redirects to a `next` parameter (default `/dashboard`). When the exchange fails or `code` is missing, it routes to `/login?error=invalid_link` instead of silently swallowing.

Server actions in [`src/app/actions/auth.ts`](src/app/actions/auth.ts) cover signup, login, forgot-password, reset-password, and signout. Sign-up's `emailRedirectTo` and forgot-password's `redirectTo` both build their absolute URL from the request headers so verification links work across preview deploys and production without a hardcoded site URL — falling back to `NEXT_PUBLIC_SITE_URL` only when headers aren't available. Reset-password explicitly checks `getUser()` before calling `updateUser({ password })`, returning a "this link has expired" error instead of failing opaquely when the recovery session has lapsed.

</details>

<details>
<summary><strong>Onboarding — CV parsing with a manual-paste escape hatch</strong></summary>

CV upload at `/onboarding/cv` is a single client form ([`src/app/onboarding/cv/cv-form.tsx`](src/app/onboarding/cv/cv-form.tsx)) with two parallel actions. The drop zone takes a PDF or DOCX, submits it via [`uploadCvAction`](src/app/actions/cv.ts), and on success populates the textarea on the right with the parsed text. The textarea below it is a `saveCvTextAction` form — paste plaintext directly, no file required. This split exists because scanned PDFs and image-only DOCXs extract to <200 characters of garbage, which the upload action rejects with a message that points the user toward the textarea.

The parser itself lives in [`src/lib/cv-parser.ts`](src/lib/cv-parser.ts) — `detectCvKind` dispatches on mime type then file extension, `parsePdf` uses `pdf-parse`'s `PDFParse` class (the function-import path triggers a debug side effect at module load that fails in serverless runtimes), `parseDocx` uses `mammoth.extractRawText`, and `normalizeCvText` strips null bytes, unifies line endings, collapses runs of blank lines and inline whitespace, and caps output at 100,000 characters.

Storage uses a per-user folder pattern: every file lands at `cvs/{user_id}/cv.{pdf|docx}`. Updating a CV upserts to the same path. Switching from PDF to DOCX (or vice versa) deletes the previous file first so we don't accumulate orphan blobs. RLS on the `storage.objects` table uses Supabase's standard `(storage.foldername(name))[1] = auth.uid()::text` policy so a user can only read or write their own folder.

</details>

<details>
<summary><strong>Preferences — delivery + searches in one page</strong></summary>

Preferences at `/preferences` ([`src/app/preferences/page.tsx`](src/app/preferences/page.tsx)) loads both tables in parallel: the user's `preferences` row and all their `search_queries`. The delivery section ([`preferences-section.tsx`](src/app/preferences/preferences-section.tsx)) is a single form with email (validated against an RFC-ish regex), frequency as four visual radio cards (hourly debug, daily, every two days, weekly), and an active switch with descriptive text that changes depending on state.

The searches section ([`searches-section.tsx`](src/app/preferences/searches-section.tsx)) is a list of cards. Each card has two modes ([`search-card.tsx`](src/app/preferences/search-card.tsx)): a view mode showing the search term, location, sites as chips, job type, remote flag, and a row of pause/edit/delete buttons; and an edit mode that expands the card into a full form with site/job-type pickers, an expandable Advanced panel for results-wanted / hours-old / Indeed country, and inline save/cancel. The empty state guides a new user to "Add your first search" — without at least one search the workspace won't unlock.

Server actions in [`src/app/actions/preferences.ts`](src/app/actions/preferences.ts) — `savePreferencesAction`, `upsertSearchAction`, `deleteSearchAction`, `toggleSearchAction` — all validate at the action layer before touching the database: site names are sanitized against a `JOB_BOARDS` allowlist (deduped, case-insensitive), `results_wanted` clamps to 1-100, `hours_old` clamps to 1-720, every mutation scopes `eq("user_id", user.id)` even when RLS would already enforce it. That's defense in depth; the application layer should never assume RLS is the only thing standing between a user and someone else's data.

</details>

<details>
<summary><strong>Dashboard — route groups, cached state, and an onboarding gate</strong></summary>

The dashboard is the most architecturally interesting route. The directory layout looks like this:

```
src/app/dashboard/
├── _lib/dashboard-state.ts          # cached loader: user + cv + prefs + searches + lastRun
├── _components/onboarding-strip.tsx # CV → Preferences two-step
├── layout.tsx                       # auth check + AppShell
├── page.tsx                         # OnboardingStrip OR redirect to /dashboard/feedback
└── (workspace)/                     # route group — shared layout, URLs stay clean
    ├── layout.tsx                   # requireReady() + StatsStrip + Tabs/Sidebar grid
    ├── _components/                 # workspace-tabs, stats-strip, sidebar
    ├── feedback/page.tsx            # Tab A (B6a will fill)
    └── tracker/page.tsx             # Tab B (B6b will fill)
```

Three patterns make this clean. First, **one cached loader.** [`loadDashboardState`](src/app/dashboard/_lib/dashboard-state.ts) is wrapped in `React.cache` so the dashboard layout, the index page, and the workspace child layout all dedupe to one query batch per request — without the cache, each `/dashboard/feedback` render would hit Supabase three times for the same data.

Second, **a route group for shared chrome.** The directory `(workspace)/` is a Next.js route group: it shares a layout among `/dashboard/feedback` and `/dashboard/tracker` without adding to the URL. Both tabs get the workspace shell (tabs + stats strip + sidebar) without their URLs containing the segment name.

Third, **a hard onboarding gate.** The workspace layout calls `requireReady()`, which checks the loader's `ready` flag (CV + prefs + active searches + active state) and redirects to `/dashboard` if any are missing. Visiting `/dashboard/feedback` before onboarding completes bounces back to `/dashboard`, which renders the onboarding strip instead of empty tabs. Users can't get stuck staring at a workspace that has no data.

The dashboard index ([`page.tsx`](src/app/dashboard/page.tsx)) is the route that *is* the onboarding strip when not ready — but is just a redirect to `/dashboard/feedback` when it is. The strip itself ([`onboarding-strip.tsx`](src/app/dashboard/_components/onboarding-strip.tsx)) shows two steps (Upload CV → Set preferences) with done / active / pending visual states, so the user knows exactly where they are in the flow.

</details>

<details>
<summary><strong>Workspace chrome — stats strip + sidebar</strong></summary>

The [stats strip](src/app/dashboard/(workspace)/_components/stats-strip.tsx) shows the last run's status pill (success / running / failed / skipped) with relative time and duration, plus a dense 4-metric grid — scraped, filtered, evaluated, approved — but only when the last run succeeded. The empty state ("Waiting for the first run") is honest about waiting for the worker to fire.

The [sidebar](src/app/dashboard/(workspace)/_components/sidebar.tsx) is two cards: Quick Actions (Run-now button, Preferences link, Update CV link) and Account (delivery email, cadence, active search count, CV character count). Run-now is rendered disabled with a "Soon" pill until B7 wires the multi-user worker — a deliberately honest placeholder, because rendering a button that silently does nothing breaks user trust more than admitting it isn't built yet.

</details>

<details>
<summary><strong>Marketing — the dual-surface landing</strong></summary>

The landing page at `/` is the only public route. Its central promise is structural: same picks, two surfaces. The hero ("Read four jobs a morning, not four hundred") sits centered and small. Below it, two artifacts side-by-side: a high-fidelity email mock with the real chrome an email client uses (sender row with avatar, "to me" line, subject heading, signature) and a high-fidelity dashboard mock with browser chrome, tab nav, action chips (Applied / Bookmark / Not for me). Both render the same three sample jobs from a shared [`sample-picks.ts`](src/components/marketing/sample-picks.ts) module — so the parallel is forced, not declared.

The metaphor is morning light reaching a quiet inbox. The accent color is a warm amber (`#ea991a`) chosen to evoke sunrise rather than the indigo/violet defaults of every other AI tool. Background tokens are warm-tinted near-blacks (`#0a0908`, `#121110`) with rgb(255, 244, 224)-based borders at three opacity levels. All tokens live as CSS variables in [`globals.css`](src/app/globals.css) and are mapped into Tailwind via `@theme inline`, so design changes cascade through every component without touching JSX.

</details>

---

## Design Decisions That Mattered

<details>
<summary><strong>Server actions over API routes</strong></summary>

Every mutation in this app goes through a server action, not a `/api/*` route handler. The reason is type-safety on the form boundary: a server action accepts `FormData`, returns a typed `State` object, and pairs with React 19's `useActionState` to give the client a single hook for the whole submit/validate/show-result cycle. The same flow expressed as an API route requires hand-rolling a fetch, parsing the JSON, mapping errors to UI, and writing TypeScript types on both sides that have to be kept in sync.

The result: feature folders like [`src/app/actions/preferences.ts`](src/app/actions/preferences.ts) are one self-contained file per feature, with the action and its `PrefState` type co-located. The corresponding client form (`preferences-section.tsx`) does `const [state, action] = useActionState(savePreferencesAction, undefined)` and binds the form to `action`. No fetch, no API contract document, no client-side validation duplication.

The one place an API route would still make sense — `/api/feedback` from external clients — is held back to B7 because that's where the embedding queue gets wired up. Until then, every mutation is a server action.

</details>

<details>
<summary><strong>Defense in depth: scoped mutations on top of RLS</strong></summary>

Every public table has Row-Level Security with an `auth.uid() = user_id` policy. That alone is enough for correctness — Supabase's PostgREST will refuse any UPDATE or DELETE that doesn't match the row's `user_id` against the session's JWT claim. So adding `eq("user_id", user.id)` in the server action is technically redundant.

But it's not redundant in the threat model. RLS is one layer of defense. A misconfigured RLS policy (a `using (true)` that slips through review, a policy temporarily dropped for a migration and not restored) silently turns into a data-leak vector. Scoping in the action layer means a regression at the database layer doesn't immediately become a vulnerability. Two locks on the door is the right shape.

This is uniformly applied: every UPDATE, every DELETE, and every Storage upload/delete in the actions layer is scoped twice. The Supabase Security Advisor confirms RLS is enabled on every table; the action code confirms the application layer doesn't trust RLS alone.

</details>

<details>
<summary><strong>React.cache on the dashboard state loader</strong></summary>

A page rendered by Next.js touches multiple components: a root layout, an intermediate layout, the page itself, and any nested layout. Each can call `loadDashboardState()` to get the user's onboarding state — but without memoization, that's three separate trips to Supabase for the same data within one render.

[`loadDashboardState`](src/app/dashboard/_lib/dashboard-state.ts) is wrapped in `React.cache`. The first call inside a request runs the four parallel Supabase queries; the second call returns the cached promise. Layouts can fetch the same data their child pages fetch, and the request stays a single batch. The tests for this loader re-import the module per test (`vi.resetModules()`) to defeat the cache between tests — because outside a request context, the cache is process-wide.

This is the right pattern any time the same state is needed by both a layout (for chrome) and its page (for content). It's also the pattern that makes the workspace layout's `requireReady()` and the workspace page's data fetches share a single source of truth without coordination.

</details>

<details>
<summary><strong>Route groups for shared layouts without URL pollution</strong></summary>

The dashboard has two tabs that share chrome (tabs nav, stats strip, sidebar) but live at distinct URLs (`/dashboard/feedback`, `/dashboard/tracker`). The naive solution is to put the chrome in `dashboard/layout.tsx`, but that pollutes `/dashboard` itself (the onboarding page) with workspace chrome that doesn't apply yet.

The right pattern is a Next.js route group. The folder `(workspace)/` doesn't add to the URL — its layout file applies to `/dashboard/feedback` and `/dashboard/tracker` but not to `/dashboard`. The dashboard index renders the onboarding strip; the workspace routes render with full chrome. Same root URL prefix, different layouts, no compromise.

This is also where the onboarding gate lives. `(workspace)/layout.tsx` calls `requireReady()` and redirects back to `/dashboard` if the user isn't onboarded — a single line in one file enforces "don't show workspace chrome to a half-onboarded user" across all current and future workspace routes.

</details>

<details>
<summary><strong>Tokens-first design system, not Tailwind classes</strong></summary>

The accent palette, surfaces, borders, and text colors are all CSS variables in [`globals.css`](src/app/globals.css), mapped into Tailwind via `@theme inline`. The button component doesn't say `bg-amber-500` — it says `bg-[var(--accent-500)]`. Changing the brand color from indigo to amber was a five-line diff in `globals.css`, not a search-and-replace across every component.

Three text levels, three border levels, four surface levels, seven accent shades, three status colors. Every component reaches into the same vocabulary. The result is consistency without a component library — `<Button>`, `<Input>`, `<Switch>`, `<Textarea>` are thin wrappers around HTML elements with the design tokens baked in.

</details>

<details>
<summary><strong>Honest placeholders for unbuilt features</strong></summary>

The Run-now button in the sidebar is rendered disabled with a "Soon" pill and a tooltip that says "Manual runs unlock once the multi-user worker is live." The Feedback tab shows a cadence-aware empty state ("We're scoring jobs every morning. Once the first run finishes, the picks land here") until the worker actually produces a run. The Tracker tab renders a 6-column kanban skeleton with the column names visible at 60% opacity.

The alternative — rendering a button that does nothing, or an empty tab with no explanation — silently breaks user trust. If a user clicks a button and nothing happens, they'll think the app is broken. A disabled button with a "Soon" pill is honest: the affordance exists, the wiring isn't there yet, here's when. The placeholders ship with the chrome; the data wires up later without the layout shifting.

</details>

---

## Engineering Discipline

**61 tests across 9 files.** The suite in [`QA/`](QA/) follows the same pyramid as the worker repo: unit tests for primitives ([`button.test.tsx`](QA/unit/button.test.tsx), [`input.test.tsx`](QA/unit/input.test.tsx)), the `cn()` helper, and the brand `Logo`; integration-flavored tests for server actions ([`cv-actions.test.ts`](QA/unit/cv-actions.test.ts), [`preferences-actions.test.ts`](QA/unit/preferences-actions.test.ts)) mocking the Supabase client; contract tests for redirects ([`auth-callback.test.ts`](QA/unit/auth-callback.test.ts), [`dashboard-state.test.ts`](QA/unit/dashboard-state.test.ts)) that pin the URL the user lands on after every code path. The whole suite runs in roughly three seconds via Vitest.

**Four-stage QA gate.** [`QA/run_all.mjs`](QA/run_all.mjs) runs four checks sequentially, fail-fast: `tsc --noEmit` (compiles the project to catch type errors the editor missed), `eslint .` (style + Next.js rules), `vitest run` (the 61 unit + integration tests), and `next build` (an actual production build that catches React Server Components misconfigurations, missing env vars, and bundling issues). Run locally with `npm run qa`. The same script runs in CI on every push and pull request via [`qa.yml`](.github/workflows/qa.yml).

**Test what would silently break.** The action tests deliberately cover the failure cases that don't throw — `upsertSearchAction` clamps `results_wanted=9999` to 100 and lowercase-emails are normalized; `deleteSearchAction` scopes by both `id` AND `user_id` (a regression to single-eq would silently leak deletes across users); `loadDashboardState` returns `ready=true` only when all four conditions hold and re-tests each missing condition in isolation. Tests for the email-callback redirect lock the exact URL for both success and failure paths. These are the tests that pay off in years, not weeks.

**Migrations are idempotent and grant-explicit.** Every SQL migration in [`migrations/`](migrations/) uses `IF NOT EXISTS` / `DROP ... IF EXISTS` so re-applying is safe, includes explicit `grant ... to authenticated` lines (Supabase's auto-grant default ends Oct 30, 2026), and is documented in [`migrations/README.md`](migrations/README.md) with a manifest, conventions, and a "how to add a new one" section. A regression in 0001 that broke the `feedback` index after 0002 dropped + rebuilt the table was wrapped in a `DO $$ ... $$` guard that checks `information_schema.columns` before creating the index — so re-running 0001 over a 0002-applied DB is now a clean no-op.

**Honest commit messages, no AI attribution.** Commits are written in the user's voice (past tense, descriptive, compact), per the repo conventions. No `Co-Authored-By` trailers, no AI attribution metadata. Commits read as if the maintainer wrote them solo, because operationally they're the maintainer's responsibility.

---

## Project Layout

<details>
<summary>Click to expand the directory tree</summary>

```
.
|-- src/
|   |-- app/                          App Router pages, route handlers, server actions
|   |   |-- actions/                  Server actions grouped by feature
|   |   |   |-- auth.ts               signup, login, password reset, signout
|   |   |   |-- cv.ts                 upload + parse + save CV text
|   |   |   `-- preferences.ts        delivery prefs + search-query CRUD
|   |   |
|   |   |-- auth/
|   |   |   |-- callback/route.ts     code-exchange landing for email links
|   |   |   `-- reset-password/       set a new password (gated by recovery session)
|   |   |
|   |   |-- dashboard/                workspace shell + tabs
|   |   |   |-- _lib/dashboard-state.ts
|   |   |   |-- _components/onboarding-strip.tsx
|   |   |   |-- layout.tsx            auth + AppShell
|   |   |   |-- page.tsx              onboarding or redirect
|   |   |   `-- (workspace)/          route group — shared layout
|   |   |       |-- layout.tsx        requireReady + stats + tabs/sidebar
|   |   |       |-- _components/      workspace-tabs, stats-strip, sidebar
|   |   |       |-- feedback/page.tsx Tab A (B6a will fill)
|   |   |       `-- tracker/page.tsx  Tab B (B6b will fill)
|   |   |
|   |   |-- forgot-password/          request a reset link
|   |   |-- login/                    sign in
|   |   |-- onboarding/cv/            upload + parse CV
|   |   |-- preferences/              delivery + searches editor
|   |   |-- signup/                   create an account
|   |   |
|   |   |-- globals.css               design tokens + Tailwind theme bridge
|   |   |-- layout.tsx                root layout
|   |   `-- page.tsx                  marketing landing
|   |
|   |-- components/
|   |   |-- brand/logo.tsx            wordmark + gradient mark
|   |   |-- layout/                   AppShell, AuthShell, marketing chrome
|   |   |-- marketing/                landing-page artifacts (EmailPreview, DashboardPreview)
|   |   `-- ui/                       Button, Input, Switch, Textarea
|   |
|   |-- lib/
|   |   |-- supabase/                 SSR client + browser client + middleware
|   |   |-- cv-parser.ts              PDF/DOCX → normalized text
|   |   `-- utils.ts                  cn() class-merge helper
|   |
|   `-- proxy.ts                      Next 16 middleware (calls updateSession)
|
|-- migrations/                       Supabase SQL, applied in numeric order
|   |-- 0001_initial_schema.sql       profiles, preferences, search_queries, runs, seen_jobs, job_results, feedback v1
|   |-- 0002_multi_user_tabs.sql      pgvector, append-only feedback rebuild, embeddings, bookmarks, reputation
|   |-- 0003_cv_storage.sql           cvs storage bucket + per-user folder RLS
|   |-- 0004_search_queries_updated_at.sql
|   |-- 0005_grant_data_api.sql       explicit Data API GRANTs (Oct-30-2026 change)
|   `-- README.md
|
|-- QA/
|   |-- run_all.mjs                   four-stage gate: types → lint → vitest → build
|   |-- setup.ts                      jest-dom matcher import
|   `-- unit/                         11 test files, 61 tests
|
|-- .github/workflows/qa.yml          CI: runs the QA gate on every push/PR
|
|-- AGENTS.md                         Next.js 16 "this is not the version you know" warning
|-- CLAUDE.md                         pointer to AGENTS.md so both CLAUDE and other agents pick it up
|-- README.md                         this file
`-- package.json                      scripts: dev, build, qa, test, test:watch
```

</details>

---

## Running It Locally

```bash
# Install deps
npm install

# Configure Supabase
cp .env.local.example .env.local
# fill in:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY

# Apply migrations in your Supabase project's SQL Editor, in order:
#   migrations/0001_initial_schema.sql
#   migrations/0002_multi_user_tabs.sql
#   migrations/0003_cv_storage.sql
#   migrations/0004_search_queries_updated_at.sql
#   migrations/0005_grant_data_api.sql

# Run the QA gate (must pass before pushing)
npm run qa

# Start the dev server
npm run dev
```

The dev server starts on `http://localhost:3000`. Auth, CV upload, and preferences work fully against a real Supabase project; the dashboard's workspace is empty until the multi-user worker (in the worker repo) starts populating `job_results`.

---

## Numbers

A snapshot of the current state:

| Metric                                | Value                                                  |
| ------------------------------------- | ------------------------------------------------------ |
| Next.js version                       | 16.2.6 (App Router, Turbopack)                         |
| React version                         | 19.2.4                                                 |
| Database                              | Supabase Postgres + pgvector                           |
| Auth                                  | Supabase Auth (email/password, with email verification) |
| File storage                          | Supabase Storage (per-user folder RLS)                 |
| Routes                                | 11 (1 public, 10 authed)                               |
| Server-action modules                 | 3 (auth, cv, preferences) — 12 actions total           |
| Migrations                            | 5 SQL files, all idempotent                            |
| Tests                                 | 61 across 9 files                                      |
| QA gate stages                        | 4 (types, lint, vitest, build)                         |
| QA gate runtime (local)               | ~16 seconds                                            |
| Marketing CTAs                        | 2 ("Get my morning", "I have an account")              |
| CV upload size cap                    | 5 MB                                                   |
| CV text character cap                 | 100,000                                                |
| Frequency options                     | hourly (debug), daily, every 2 days, weekly            |
| Job boards supported                  | LinkedIn, Indeed, Glassdoor, ZipRecruiter, Google      |
| Feedback states (Tab A)               | Applied, Bookmark, Not for me, Block company, Wrong location, Other |
| Tracker columns (Tab B)               | Saved → Applied → Phone Screen → Interview → Offer → Closed |
| Monthly cost (Supabase + Vercel free) | $0                                                     |

---

## What's Next

The single-user web app is operational up to **B6** — auth, onboarding, preferences, and the workspace shell with onboarding gating. The path forward is filling the workspace and wiring the worker:

- **B6a — Tab A (Feedback):** real job cards from `job_results` for the latest run, with the 6 feedback buttons writing through `/api/feedback`. The workspace shell already enforces the onboarding gate and reads the last run's status; B6a only fills the tab body.
- **B6b — Tab B (Tracker):** the bookmarks kanban with 6 pipeline columns, drag-and-drop status changes, append-only `status_history` in JSONB, and a "Add from results" modal that lists `job_results` rows not yet bookmarked.
- **B7 — Multi-user worker:** the Python worker in the worker repo learns to loop over Supabase users instead of reading `config.json`. Includes `B7d` — the `/api/feedback` Next.js route that this app needs for Tab A to write.
- **B7a — Resend integration:** replace SMTP with Resend for the per-user email delivery (worker-side change).
- **B8 — Hourly worker cron:** a separate workflow in the worker repo that fires every hour and runs whoever's `next_run_at` has passed.

After B7 ships, the dashboard's Run-now button comes off "Soon" and becomes a rate-limited rerun trigger. After B8, the system is genuinely multi-user.

---

## A Personal Note

The worker repo is what I built for myself. This repo is what I'm building so my friends in the same job hunt don't have to fork it. The pipeline beneath is the same — same nine sources, same filter gauntlet, same Cerebras + Groq verdict, same regression tests pinning every shipped bug. What changes is the shape of the front door.

The front door matters. If a tool requires a setup tutorial to use, the people who would have benefited most from it never reach it. The single-user pipeline solved a problem I had. The web app is the version of that solution that other people can use without learning Python, Supabase, or what RLS stands for. They sign up, upload a CV, configure a search, and get scored picks every morning. That is the goal.

If you're an engineer reading this and want to understand how the multi-tenant surface is shaped, every server action has an inline doc-comment explaining what it scopes and why, every migration is idempotent and explains its motivation, every test file's docstring names the contract it locks down. If you're a recruiter or hiring manager looking for evidence of how I think about building software for other people — about multi-tenancy, about security boundaries, about honest empty states, about pulling production tools out of the hands of CLI-comfortable maintainers and into the hands of the people they were always supposed to serve — this repository is what I can offer.

Thank you for reading.
