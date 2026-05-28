# Job Alerts — web app

The multi-user web frontend for the Automated AI Job Intelligence System.
Users sign up, upload a CV, configure search preferences, and receive an AI-scored
morning email plus a personal dashboard for reactions and a private application
tracker.

The Python pipeline that actually scrapes, scores, and emails lives in a
separate repo: [`Automated-AI-Job-Intelligence-System`](https://github.com/moe-the-goat/Automated-AI-Job-Intelligence-System).
This repo is the user-facing surface.

## Stack

- **Next.js 16** (App Router, Turbopack), React 19, TypeScript, Tailwind v4
- **Supabase** — Postgres + Auth + Storage + Row-Level Security
- **Vitest** + Testing Library for unit tests, ESLint, `tsc --noEmit` for typecheck

## Local development

```bash
npm install
cp .env.local.example .env.local   # then fill in NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY
npm run dev
```

The app expects a Supabase project with migrations 0001–0005 applied
(see [migrations/README.md](migrations/README.md)).

## Quality gate

Before pushing, run the QA suite:

```bash
npm run qa
```

This runs, in order: `tsc --noEmit` → `eslint` → `vitest run` → `next build`.
The same suite runs on every push via [`.github/workflows/qa.yml`](.github/workflows/qa.yml).

Add new tests under [`QA/unit/`](QA/unit) — Vitest picks up `*.test.{ts,tsx}` automatically.

## Routes

| Path                       | Purpose                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `/`                        | Marketing page (email + dashboard preview)                 |
| `/signup`, `/login`        | Email/password auth                                        |
| `/forgot-password`         | Reset-password request                                     |
| `/auth/callback`           | Supabase code-exchange landing                             |
| `/auth/reset-password`     | Set a new password (gated by recovery session)             |
| `/onboarding/cv`           | Upload PDF/DOCX, parse text, store under `profiles.cv_text`|
| `/preferences`             | Delivery settings + searches list editor                   |
| `/dashboard`               | Onboarding strip until ready, then redirects to Feedback   |
| `/dashboard/feedback`      | Tab A — reactions on AI-scored jobs (B6a, in progress)     |
| `/dashboard/tracker`       | Tab B — bookmarks kanban (B6b, in progress)                |

## Source layout

```
src/
├── app/                  # App Router pages, route handlers, server actions
│   ├── actions/          # Server actions grouped by feature (auth, cv, preferences)
│   ├── auth/             # OAuth callback + reset-password
│   ├── dashboard/        # Workspace shell + tabs (route group: (workspace))
│   ├── onboarding/       # CV upload flow
│   └── preferences/      # Notification + searches editor
├── components/
│   ├── brand/            # Logo
│   ├── layout/           # AppShell, AuthShell, marketing chrome
│   ├── marketing/        # Landing-page artifacts
│   └── ui/               # Primitives (Button, Input, Switch, Textarea)
└── lib/
    ├── supabase/         # SSR client + middleware session refresh
    ├── cv-parser.ts      # PDF/DOCX → normalized text
    └── utils.ts          # cn() class-merge helper
```

## Conventions

- **Server actions** live in `src/app/actions/` and `"use server"`-tag the whole file.
- **All mutations** scope by `user_id` on top of Supabase RLS (defense in depth).
- **Design tokens** are CSS variables in `src/app/globals.css`, mapped into Tailwind via `@theme inline`.
- **Route groups** like `(workspace)/` share a layout without changing URLs.
- **Underscore folders** like `_lib/` and `_components/` are non-routable per Next.js convention.

## Deployment

Deployed to Vercel from `main`. Push to deploy — there is no separate release step.
