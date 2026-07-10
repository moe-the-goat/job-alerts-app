# Job Alerts — Web App

A multi-user web app for an AI job-scoring pipeline. People request access, get approved, upload a CV, configure their searches, and every morning an AI scores nine job boards against their CV and delivers a short, honest shortlist to their inbox and to a personal dashboard where they react, bookmark, and track applications. Their reactions tune tomorrow's picks.

> **This repository is one half of a two-part project.** The Python engine that actually scrapes, filters, scores, learns, and sends the email lives in its own repo: **[Automated AI Job Intelligence System](https://github.com/moe-the-goat/Automated-AI-Job-Intelligence-System)**. That repo tells the full story of the system and the pipeline; this one is the front door people sign up and log into. If you have not read the engine repo yet, start there: this README picks up exactly where it hands off.

This repository is what makes the engine usable by someone who has never heard of a cron job.

---

## The story, continued

The engine repo explains how this started: a job hunt that wasted hours because every aggregator ranks for a default candidate I am not, and a pipeline I built to invert that ranking for myself. It worked. It ran every morning, for free, and told me the truth about that day's market.

Then friends in the same hunt asked for it, and "just fork the repo and configure your secrets" turned out to be no answer at all. The people who would benefit most from the tool are exactly the people who do not run GitHub Actions, do not keep environment variables, and do not want to learn what RLS stands for. The cron job and the AI prompt are implementation details to them. They open an email, scan it, and close it.

So the personal pipeline had to grow a front door, and that is this repository. It was not a matter of slapping a login on top. Multi-tenancy is its own engineering problem: adding a `user_id` column to every table does not make a single-user system multi-user, it makes a broken single-user system that leaks data between accounts. Real isolation has to be enforced at the database, at the application layer, in file storage, and in the session model, all at once. And because I was opening it to real people, it needed a way to control who gets in, which became a closed-beta access gate that turned out to be the single hardest thing in the project to get right. That part of the story is below.

---

## Overview

A visitor lands on the marketing page, sees the promise (same picks, in your inbox and on your dashboard), and requests access with their name and email. Because this is a closed beta, signup does not create an account directly: it files a request and emails me to approve or reject it. On approval the account is created and the person receives an email pointing them to a page where they set up their login with a one-time code. On rejection they get a polite decline.

Once in, a new user is walked through onboarding: upload a CV (PDF or DOCX, parsed server-side to plaintext and saved against their profile, with a manual-paste fallback for scanned files), then configure preferences — notification email, delivery cadence, the career tracks they are targeting, their target seniority, and at least one search query. The moment all the pieces are in place, the onboarding strip collapses and the workspace unlocks.

After that, the multi-user worker (the Python service in the engine repo) includes them in its cron. For every active, approved user whose next run is due, the worker reads their CV, tracks, and searches from the shared Supabase database, runs the pipeline against them, writes the run summary and the scored jobs back, and sends the morning email over Gmail SMTP. The user opens the dashboard and finds the same picks waiting in the **Feedback** tab, where they mark each job as Applied, Bookmark, Not for me, Block company, Wrong location, or Other — and, per job, can ask an AI to gap-check or rebuild their CV for that specific role and download it as a PDF. Bookmarks flow into the **Tracker** tab, a private application board with pipeline columns from Saved through Offer, and an **Insights** tab charts their own match trends over time.

Every reaction is one verdict per job, written to the shared database and embedded into a per-user RAG corpus. A periodic digest compresses each user's history into a structured preference profile that the verdict LLM reads on the next run, so tomorrow's picks reflect what they actually applied to yesterday.

Inside this repo there are fifteen page routes and three API routes under `src/app/`, a design-token UI kit with a light-default / dark theme, six feature-scoped server-action modules, twenty-eight idempotent SQL migrations, **296 tests across 34 files**, and a four-stage QA gate that runs on every push. The rest of this document is a tour of why each piece is shaped the way it is.

---

## The problem it solves

The engine already works. It runs every morning on free infrastructure and has shipped job emails for months. The problem it does not solve on its own is: how do other people use it without becoming maintainers?

The natural answer, "fork the repo, configure your secrets, add your CV, schedule the workflow," is a non-answer. It assumes comfort with GitHub Actions, environment variables, and CI/CD that excludes everyone the tool is supposed to help.

The deeper problem is multi-tenancy itself. Adding a `user_id` column everywhere does not make a system multi-user; it makes a single-user system that silently leaks across accounts. Real multi-tenancy needs row-level security at the database, scoped mutations at the application layer, isolated storage paths for uploaded files, and a session model that survives middleware refresh. None of those bolt on after the fact.

And there is a third problem this app solves that a public signup would not: control. Opening a tool that spends real LLM and scraping budget per user to the entire internet is a way to wake up to an abuse bill. So the app is a closed beta by design, with an approval gate that keeps me in the loop on exactly who gets in.

This repository is the answer to all three. It assumes the user knows nothing about the pipeline beneath it, exposes every piece of configuration as a UI control, enforces tenant isolation at every layer a request can pass through, and gates access behind an approval flow.

---

## How it works

At the highest level, the app is a flow that closes back through the worker:

```
   request access  ->  admin approves (email or /admin)
            |
            v
   account created + invite -> /claim (one-time code) -> set password
            |
            v
   onboarding gate
   (CV upload + preferences + at least one active search)
            |
            v
   dashboard unlock (Feedback tab / Tracker tab)
            |
            v
   worker reads active, approved users from Supabase, runs the pipeline per user
   (cron in the engine repo, writes job_results + runs)
            |
            v
   user reads the morning email + reacts in the Feedback tab
            |
            v
   feedback -> embeddings -> next run's prompt (per-user RAG)
```

Each stage exists because the previous one could not be skipped. The access gate exists because this is a budgeted closed beta. The onboarding gate exists because a user without a CV cannot be scored, a user without preferences has no email to deliver to, and a user without an active search yields zero jobs. The worker stays in its own repo because it is a long-running Python process with a different deployment model. The reactions feed back through embeddings because the AI prompt has limited context and needs a compressed view of each user's history.

**Stage 1 — Access gate.** Signup is request-first. It files a row in `access_requests` and emails me with approve and reject links (and a parallel `/admin` page). On approval the worker-side account is created and the user is whitelisted so the pipeline will process them; on rejection they get a decline. No password is collected before approval.

**Stage 2 — Account claim.** Instead of a single-use invite link (which corporate and university mail scanners pre-open, burning the token before the human clicks), approval sends the user to a token-less `/claim` page. There they request a one-time code, type it in, and set a password. A scanner cannot fill a form or type a code, so the flow is robust across every email provider. This was the hardest bug in the project, and the section below tells the whole story.

**Stage 3 — Onboarding.** Two steps, gated by a `requireReady` check. The CV upload accepts PDF or DOCX (5 MB cap), parses text server-side via `unpdf` (a serverless-safe pdf.js build) or `mammoth`, validates that at least a few hundred characters were extracted (scanned PDFs fail this and fall through to a manual paste textarea), and saves the file to a per-user folder in Supabase Storage. The preferences page covers delivery (email, cadence, active toggle), the career tracks and target seniority that steer scoring, searches (cards with inline edit, each naming a board, location, sites, job type, remote eligibility, and recency window), and an optional GitHub connect.

**Stage 4 — Dashboard unlock.** Once CV, preferences, and at least one active search are all present and the user has not paused the pipeline, the onboarding strip collapses and the page redirects into the workspace. Both tabs live under a Next.js route group that shares one layout: the workspace shell with tab navigation, a last-run stats strip, and a right rail with quick actions including a manual run-now button governed by a daily run budget.

**Stage 5 — Worker run.** The worker (in the engine repo's cron) reads active, approved, due users, runs the pipeline per user, and writes runs and scored jobs back to Supabase. None of this is in this repo; the web app's job is to expose what the worker produced and to capture what the user does with it.

**Stage 6 — Feedback loop.** Reactions in the Feedback tab POST to `/api/feedback`. Feedback is one verdict per job: a new reaction replaces the previous one for that job rather than stacking, so the signal the AI learns from stays clean. The worker embeds each verdict into the per-user RAG corpus, and the next run reads it.

That is the system, end to end. The next section is the deep tour.

---

## The web app in detail

<details>
<summary><strong>Access gate — request, approve, claim</strong></summary>

Signup never creates an account directly. The signup form posts to a server action that writes a pending row to `access_requests` (name, email, optional note, a hashed decision token) and emails me with one-click approve and reject links plus a note that no password is ever shown to me. The links hit `/api/access-decision`, which authenticates by token hash with no login required and renders a confirmation page; the same approve and reject actions are also available on a `/admin` page guarded by an admin user id. Both surfaces funnel through one shared `approveRequest` / `rejectRequest` pair so the two paths can never drift.

On approval the account is created server-side with the email pre-confirmed, the profile is whitelisted so the worker will process it, the request is marked approved, and the user is emailed a link to the claim page. On rejection the request is marked and a decline email goes out. The whole flow exists so a budgeted closed beta stays closed without me running SQL by hand for every new person.

</details>

<details>
<summary><strong>Account claim — the hardest bug in the project</strong></summary>

The first version of approval used Supabase's built-in invite email, which carries a single-use token in the link. It failed, and the way it failed taught me the most of anything in this build.

The invite went to a university address. The link, clicked by a human within seconds, came back with "this sign-in link is invalid or has expired." The account existed in the database but was stuck unconfirmed with no password. My first fix assumed the callback was mishandling the token format, so I taught `/auth/callback` to verify both the OAuth code flow and the email one-time-token flow. It still failed.

The breakthrough came from reading the actual URL the email pointed to, before and after clicking. The after-click URL contained `error_code=otp_expired`. The token was being consumed before the human ever touched it. University and corporate mail servers run link scanners that automatically fetch every link in an incoming email to check it is safe, and a single-use token cannot survive being fetched twice. The scanner clicked first; the human clicked an already-dead link.

No callback fix could solve that, because the token never survived to the callback. The real fix was to stop relying on a link the recipient receives and instead make the user initiate the flow. Approval now sends them to a token-less `/claim` page (safe for a scanner to pre-open, because there is nothing to consume), where they enter their email, request a one-time code, and type it back in. A scanner cannot fill a form or type a six-digit code. Account creation also moved from the invite API to direct creation with the email pre-confirmed, so no stray provider email goes out at all. One more small bug surfaced during testing: this project's one-time codes are eight digits, and the input was capped at six, silently truncating valid codes; the field now accepts the full length.

The lesson, which I would carry into any auth flow: a credential delivered in a link is a credential a machine can spend before the human does. User-initiated beats link-delivered whenever an unknown mail server sits in the middle.

</details>

<details>
<summary><strong>Auth — Supabase SSR with cookie refresh on every request</strong></summary>

Auth is handled by `@supabase/ssr` with three thin pieces: a browser client for client components, a server client for server components and server actions, and a Next.js middleware (named `proxy.ts` per Next 16's rename) that refreshes the session cookie on every request before the page renders.

Several flows route through `/auth/callback`: it handles both the OAuth code-exchange flow and the email one-time-token flow used by password-reset and recovery links, verifying whichever it is given and routing invites and recoveries to the set-password page. When neither a code nor a token is usable, it sends the user to login with an explicit error hint instead of silently swallowing. Reset-password checks the session before calling `updateUser({ password })`, returning a clear "this link has expired" message instead of failing opaquely.

</details>

<details>
<summary><strong>Onboarding — CV parsing with a manual-paste escape hatch</strong></summary>

CV upload is a single client form with two parallel actions. The drop zone takes a PDF or DOCX, submits it via an upload action, and on success populates the textarea with the parsed text. The textarea below it is a separate save action: paste plaintext directly, no file required. This split exists because scanned PDFs and image-only DOCXs extract to a few characters of garbage, which the upload action rejects with a message that points the user toward the textarea.

The parser dispatches on mime type then extension, uses `unpdf` for PDFs and `mammoth` for DOCX, and normalizes the result (strips null bytes, unifies line endings, collapses blank runs, caps length). PDF parsing originally used `pdf-parse`, which passed every local test but failed in the deployed Vercel function — it had to be externalized from the bundle and then was not reliably traced into it, so PDF uploads worked locally and broke in production. `unpdf` bundles cleanly as a self-contained serverless pdf.js build, and a QA test now parses a real PDF end-to-end so the failure cannot come back silently. Storage uses a per-user folder pattern: every file lands at `cvs/{user_id}/cv.{ext}`, updates upsert to the same path, and switching formats deletes the previous file so orphans do not accumulate. The storage RLS policy ties each folder to its owner's user id.

</details>

<details>
<summary><strong>Preferences — delivery and searches in one page</strong></summary>

Preferences loads both tables in parallel: the user's `preferences` row and all their `search_queries`. The delivery section is one form with a validated email, a cadence picker (the hourly option doubles as a debug speed), and an active switch with text that changes by state. A profile section lets the user pick their **career tracks** (a curated multi-select — Backend, AI/ML, Data Engineering, and so on) and their **target seniority** (entry / mid / senior); the tracks drive the worker's role weighting and can seed the search set, and the seniority steers how aggressively the pipeline filters senior roles. A "Regenerate from paths" button re-seeds the searches from the chosen tracks (round-robin, so every track is covered), keeping any the user edited by hand. The searches section is a list of cards, each with a view mode (search term, location, sites as chips, job type, remote flag, pause/edit/delete) and an edit mode that expands into a full form with site and job-type pickers and an Advanced panel for results-wanted, recency window, and country. An optional **GitHub connect** pulls a short digest of the user's public repositories that the worker appends to the CV text, so the scorer sees real project work the CV might not spell out.

Every mutation validates at the action layer before touching the database: site names are sanitized against an allowlist, numeric fields are clamped to sane ranges, and every write scopes to the user id even though RLS would already enforce it. That is defense in depth; the application layer should never assume RLS is the only thing standing between a user and someone else's data.

</details>

<details>
<summary><strong>Dashboard — route groups, cached state, and an onboarding gate</strong></summary>

The dashboard is the most architecturally interesting part. Three patterns keep it clean.

First, one cached loader. The dashboard state loader is wrapped in `React.cache` so the layout, the index page, and the workspace child layout all dedupe to a single query batch per request, instead of hitting Supabase three times for the same data.

Second, a route group for shared chrome. The `(workspace)` directory is a Next.js route group: it shares a layout among the Feedback and Tracker tabs without adding a segment to the URL. Both tabs get the workspace shell (tabs, stats strip, sidebar) while their URLs stay clean.

Third, a hard onboarding gate. The workspace layout calls `requireReady()`, which checks CV, preferences, active searches, and active state, and redirects to the dashboard index if any are missing. Visiting a workspace tab before onboarding completes bounces back to the onboarding strip rather than showing empty tabs, so a user can never get stuck staring at a workspace with no data.

</details>

<details>
<summary><strong>Feedback and Tracker — the two working tabs</strong></summary>

The Feedback tab renders the latest run's scored jobs as cards grouped by origin (local versus global), each with the AI verdict, match sub-scores, and the reaction buttons. Reactions are one verdict per job: tapping a different reaction replaces the previous one rather than stacking a contradictory second row, which keeps the training signal the worker reads clean and the displayed count honest. A keyboard flow (move, expand, mark applied, block) makes triage fast, and an optional note can ride along with any reaction to add a justification the digest will read.

The Tracker tab is a private application board. Bookmarking a job from the Feedback tab lands it there, and an "add from results" picker scoped to the latest run lets a user track a job without searching through everything they have ever seen. The board is a horizontally-scrolling kanban with fixed-width columns so cards stay readable, and it carries a status history so the progression from Saved through Offer is preserved.

</details>

<details>
<summary><strong>Per-job CV tailoring — gap check and a downloadable draft</strong></summary>

Inside any expanded job, two AI actions help the user aim their CV at that specific role, both grounded in a hard "never invent experience" rule — they only reorganize and surface what is already in the CV.

The first, **Gap check**, returns a short plain-text list of what the posting wants that the CV does not show and how to fix it. The second, **Tailored draft**, does one generation that rebuilds the CV as *structured* data (name, contact, summary, skills, projects, education, certifications), calibrated to the job. The panel shows it as copyable text and also renders it into a **downloadable PDF** through a template the user picks (Classic, ATS-plain, or a modern serif). The templates are pure HTML/CSS renderers over the same data and ship with only placeholder content — the user's real data is injected at render time in their browser and printed via the browser's own "Save as PDF", so it costs nothing and never trips a pop-up blocker (an early version opened a new window and did). Both actions are cached by a hash of the CV so a repeat click is free until the CV changes, and the rebuild is capped to a few per day. The model is Groq's `gpt-oss-120b` on a dedicated key, called with `reasoning_format: "hidden"` and JSON mode so the structured output comes back clean and parseable.

</details>

<details>
<summary><strong>Insights — the user's own analytics</strong></summary>

The Insights tab turns a user's own run history into a small dashboard: how many jobs were scraped, evaluated, and approved over time, how their match scores trend, and where their picks are coming from. It reads only that user's rows (RLS-scoped like everything else) and is a read-only complement to the Feedback and Tracker tabs — the place to see whether the tuning is working, not to act on a single job.

</details>

<details>
<summary><strong>Admin — access requests and system analytics</strong></summary>

A single admin account (gated by an `ADMIN_USER_ID` env var, so the route and even the nav link never render for anyone else) gets a private `/admin` surface. It handles the access-request queue (approve / reject / resend a claim email) and an Analytics tab: system-wide user and run counts, health signals (stalled runs, email-send failures, zero-result runs, overdue schedules), feedback and engagement trends, per-user drill-down, and an LLM-usage panel that tracks requests, tokens, and peak RPM per provider against each free tier's caps. It is how a one-person beta stays observable without SSHing into anything.

</details>

<details>
<summary><strong>Manual run — a budgeted run-now button</strong></summary>

The sidebar's run-now button dispatches the worker on demand through a GitHub workflow trigger, governed by a per-user daily run budget counted from local midnight in Jerusalem. A user gets a small number of runs per day; the button shows how many remain, the worker enforces the budget so the web side cannot be tricked into exceeding it, and triggering a manual run stamps it and cancels that day's scheduled one so the two cannot double-spend. There is also a reschedule control for moving the next scheduled run.

</details>

<details>
<summary><strong>Email feedback page — reacting without logging in</strong></summary>

Every morning email links to a private, tokenized feedback page so a user can react from their phone without opening the dashboard. The token is per user and per run; only its hash is stored, so reading the table cannot reconstruct a working link. A pair of database functions, running with elevated privilege but validating the token, expiry, and job ownership internally, are the only public surface: the anonymous client never touches a table directly. Reactions there follow the same one-verdict-per-job rule as the dashboard, and an optional note is supported too.

</details>

<details>
<summary><strong>Marketing — the dual-surface landing</strong></summary>

The landing page is the only public route. Its central promise is structural: same picks, two surfaces. The hero sits above two artifacts side by side: a high-fidelity email mock with the chrome a real email client uses, and a high-fidelity dashboard mock with the reaction chips. Both render the same sample jobs from one shared module, so the parallel is forced rather than declared. The palette is the app's **"First Light"** identity — a calm pre-dawn navy grounds the interface and a single sunrise amber is rationed for the moments the product delivers (a strong match score, the top pick), reinforcing the "your matches, every morning" idea rather than decorating it. The brand mark is a lowercase "j" whose dot is a rising sun. All colors live as CSS variables mapped into Tailwind, so the whole look is defined in one file.

</details>

---

## Design decisions that mattered

<details>
<summary><strong>User-initiated codes over delivered links</strong></summary>

The account-claim story above is the headline example, but the principle generalizes: any credential delivered inside an email link can be spent by a machine before the human clicks it. Mail scanners on corporate and university tenants pre-fetch links as a security measure, and single-use tokens do not survive that. Wherever an unknown mail server sits between the system and the user, a flow the user initiates (request a code, type it back) beats a flow that hands them a one-shot link.

</details>

<details>
<summary><strong>Defense in depth: scoped mutations on top of RLS</strong></summary>

Every public table has row-level security with an `auth.uid() = user_id` policy, which alone is enough for correctness. So scoping `eq("user_id", user.id)` in the server action is technically redundant. It is not redundant in the threat model: a misconfigured policy, a `using (true)` that slips through review, or a policy dropped for a migration and not restored, silently becomes a data-leak vector. Scoping in the action layer means a regression at the database layer does not immediately become a vulnerability. Two locks on the door is the right shape, applied uniformly to every update, delete, and storage operation.

</details>

<details>
<summary><strong>One verdict per job, enforced at the database</strong></summary>

Feedback began append-only, one row per click. That let a user stack contradictory reactions on a single job (applied, then not-for-me, then other), and since the worker embeds every feedback row into the RAG corpus, those contradictions trained the next run in opposite directions and inflated the count that flips a user into the heavier scoring mode. The fix made it one verdict per job: a unique index on (user, job), an upsert that replaces the previous reaction, and a migration that collapsed existing duplicates to the most recent. The latest reaction wins, everywhere, including the email page.

</details>

<details>
<summary><strong>Server actions over API routes</strong></summary>

Almost every mutation goes through a server action, not an API route handler, for type-safety on the form boundary: an action accepts `FormData`, returns a typed state, and pairs with React's `useActionState` for a single submit/validate/show-result hook. The same flow as an API route means hand-rolling a fetch, parsing JSON, mapping errors, and keeping types in sync on both sides. The few genuine API routes that exist (feedback, the tokenized email feedback, the access-decision links) are there because they serve clients that are not a logged-in React form.

</details>

<details>
<summary><strong>React.cache on the dashboard state loader</strong></summary>

A single page render touches a root layout, an intermediate layout, the page, and a nested layout, each of which may need the user's onboarding state. Without memoization that is several trips to Supabase for the same data within one render. Wrapping the loader in `React.cache` makes the first call run the parallel queries and every later call in the same request return the cached promise. The tests reset modules per test to defeat the cache between them, because outside a request context the cache is process-wide.

</details>

<details>
<summary><strong>Tokens-first design system, with a real light and dark theme</strong></summary>

The accent, surfaces, borders, and text colors are all CSS variables mapped into Tailwind, so a component says `bg-[var(--accent-500)]`, not a hardcoded color. That token discipline is what made two full re-themes cheap: the app has been through a couple of palettes, and the current "First Light" identity ships **both a light and a dark theme** built from the same tokens. Light is the default for everyone on first visit (a deliberate choice — the app does not silently follow the OS setting); a toggle flips to a full night-sky dark variant, the choice persists, and a tiny pre-paint script applies it before first render so there is no flash of the wrong theme. Because every surface reads through the tokens, adding the second theme was a matter of defining a second set of values, not touching components; the few places that had hardcoded dark-only colors were the only real work. Thin wrappers around HTML elements (button, input, switch, textarea) reach into the same vocabulary, giving consistency without a heavy component library.

</details>

---

## Engineering discipline

**296 tests across 34 files.** The suite follows the same pyramid as the engine repo: unit tests for primitives and helpers, integration-flavored tests for server actions with the Supabase client mocked, and contract tests that pin the exact URL a user lands on after every auth code path. The suite runs in a few seconds via Vitest.

**Four-stage QA gate.** `npm run qa` runs four checks fail-fast: a type check (`tsc --noEmit`), lint, the Vitest suite, and a real production `next build` that catches server-component misconfigurations and bundling issues a unit test never would. The same script runs in CI on every push and pull request. One hard-won habit lives here: clear the incremental TypeScript build cache before trusting a green local run, because a stale cache can pass locally while a clean CI checkout fails on the same code.

**Test what would silently break.** The action tests deliberately cover failures that do not throw: numeric fields clamping out-of-range input, emails normalizing to lowercase, deletes scoped by both id and user id so a regression to a single filter cannot leak across accounts, and the dashboard readiness flag flipping true only when every condition holds. The callback tests lock the exact redirect for both success and failure. These are the tests that pay off in years, not weeks.

**Migrations are idempotent and grant-explicit.** Every SQL migration uses `IF NOT EXISTS` / `DROP ... IF EXISTS` so re-applying is safe, includes explicit grants (Supabase's auto-grant default is ending), and is documented in a migrations README. Several migrations exist precisely because an earlier one needed a careful, reversible correction, and each carries a comment explaining the motivation.

**Honest commit messages, no AI attribution.** Commits are written in a human voice, past tense, descriptive and compact, with no co-author trailers or AI attribution. They read as if the maintainer wrote them solo, because operationally they are the maintainer's responsibility.

---

## Project layout

<details>
<summary>Click to expand the directory tree</summary>

```
.
|-- src/
|   |-- app/                          App Router pages, route handlers, server actions
|   |   |-- actions/                  server actions grouped by feature
|   |   |   |-- auth.ts               request-first signup, login, password reset, signout
|   |   |   |-- cv.ts                 upload + parse + save CV text
|   |   |   |-- preferences.ts        delivery prefs + paths + seniority + search CRUD
|   |   |   |-- run.ts                manual run-now dispatch + reschedule (daily budget)
|   |   |   |-- github.ts             optional public-GitHub connect + repo digest
|   |   |   `-- tailor.ts             per-job CV gap-check + structured tailored draft
|   |   |
|   |   |-- admin/                    access-request queue + analytics (admin-only)
|   |   |-- claim/                    token-less account setup via one-time code
|   |   |-- auth/                     callback (code + OTP flows) + reset-password
|   |   |-- api/                      feedback, email-feedback, access-decision
|   |   |-- dashboard/                workspace shell + Feedback/Tracker/Insights (route group)
|   |   |-- onboarding/cv/            upload + parse CV
|   |   |-- preferences/              delivery + paths + searches + GitHub editor
|   |   |-- f/[token]/                tokenized email feedback page (no login)
|   |   |-- forgot-password/ login/ signup/
|   |   |-- globals.css               design tokens (light + dark) + Tailwind theme bridge
|   |   |-- icon.svg                  theme-aware favicon (the j-monogram mark)
|   |   |-- layout.tsx                root layout + pre-paint theme script
|   |   `-- page.tsx                  marketing landing
|   |
|   |-- components/                   brand (logo + theme toggle), shells, marketing, UI kit
|   |-- lib/
|   |   |-- supabase/                 SSR client + browser client + admin client + middleware
|   |   |-- email-smtp.ts             Gmail SMTP sender (mirrors the worker's transport)
|   |   |-- access-requests.ts        approve/reject + claim email bodies + token hashing
|   |   |-- cv-parser.ts              PDF (unpdf) / DOCX (mammoth) -> normalized text
|   |   |-- cv-tailor.ts              tailor prompts, caps, Groq call (reasoning hidden)
|   |   |-- cv-templates.ts           structured-CV schema + parser + 3 print templates
|   |   `-- utils.ts                  cn() class-merge helper
|   |
|   `-- proxy.ts                      Next 16 middleware (refreshes the session)
|
|-- migrations/                       Supabase SQL, applied in numeric order (28 files)
|-- QA/
|   |-- run_all.mjs                   four-stage gate: types -> lint -> vitest -> build
|   |-- unit/                         296 tests across the suite
|   `-- stubs/                        test stubs (e.g. server-only)
|
|-- .github/workflows/qa.yml          CI: runs the QA gate on every push/PR
|-- AGENTS.md                         Next.js 16 "this is not the version you know" notes
|-- README.md                         this file
`-- package.json                      scripts: dev, build, qa, test, test:watch
```

</details>

---

## Running it locally

```bash
# Install deps
npm install

# Configure environment (.env.local)
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY        (server-only: admin client, access gate)
#   SENDER_EMAIL / EMAIL_APP_PASSWORD (Gmail SMTP for transactional mail)
#   ADMIN_USER_ID                     (locks /admin to you)
#   NEXT_PUBLIC_SITE_URL              (canonical app URL, powers email links)
#   GH_DISPATCH_TOKEN                 (lets run-now trigger the worker)
#   GROQ_TAILOR_API_KEY               (dedicated Groq key for the per-job CV tailor)

# Apply the migrations in your Supabase project's SQL Editor, in numeric order
#   migrations/0001_*.sql ... 0028_*.sql

# Run the QA gate (must pass before pushing)
npm run qa

# Start the dev server
npm run dev
```

The dev server starts on `http://localhost:3000`. Auth, the access gate, CV upload, and preferences work fully against a real Supabase project; the dashboard's workspace fills once the multi-user worker in the engine repo starts populating runs.

---

## Numbers

A snapshot of the current state:

| Metric                                | Value                                                  |
| ------------------------------------- | ------------------------------------------------------ |
| Next.js version                       | 16.2.6 (App Router, Turbopack)                         |
| React version                         | 19.2.4                                                 |
| Database                              | Supabase Postgres + pgvector                           |
| Auth                                  | Supabase Auth + closed-beta approval gate              |
| Account setup                         | request -> approve -> one-time-code claim              |
| File storage                          | Supabase Storage (per-user folder RLS)                 |
| Email transport                       | Gmail SMTP (any recipient, no domain)                  |
| Theme                                 | First Light — light default + full dark, one toggle    |
| Dashboard tabs                        | Feedback, Tracker, Insights                            |
| Page routes / API routes              | 15 / 3                                                 |
| Server-action modules                 | 6 (auth, cv, preferences, run, github, tailor)         |
| Migrations                            | 28 SQL files, all idempotent                           |
| Tests                                 | 296 across 34 files                                    |
| QA gate stages                        | 4 (types, lint, vitest, build)                         |
| Feedback model                        | one verdict per (user, job), latest reaction wins      |
| CV upload size cap                    | 5 MB (PDF via unpdf, DOCX via mammoth)                 |
| Per-job CV tailor                     | gap check + structured draft -> downloadable PDF       |
| Frequency options                     | hourly (debug), daily, every 2 days, weekly            |
| Manual runs                           | budgeted per day (Jerusalem midnight)                  |
| Monthly cost (Supabase + Vercel free) | $0                                                     |

---

## A personal note

The engine repo is what I built for myself. This repo is what I built so other people in the same job hunt do not have to fork it. The pipeline beneath is the same: same sources, same filter gauntlet, same recruiter-voice verdict, same regression tests pinning every shipped bug. What changes is the shape of the front door.

The front door matters more than I expected. If a tool needs a setup tutorial, the people who would benefit most from it never reach it. Getting the door right meant solving problems the single-user version never had: tenant isolation that does not leak, an access gate that keeps a budgeted beta closed, and an account flow that survives email scanners I did not know existed until one silently broke it. Each of those was a wall I hit alone and got over before the next person could use the thing, and the account-claim bug in particular is the one I learned the most from.

If you are an engineer reading this and want to understand how the multi-tenant surface is shaped, every server action has a doc-comment explaining what it scopes and why, every migration explains its motivation, and every test file names the contract it locks down. If you are a recruiter or hiring manager looking for evidence of how I think about building software for other people, about multi-tenancy, security boundaries, honest empty states, and pulling a production tool out of the hands of a CLI-comfortable maintainer and into the hands of the people it was always meant to serve, this repository, together with its [engine companion](https://github.com/moe-the-goat/Automated-AI-Job-Intelligence-System), is what I can offer.

Thank you for reading.
