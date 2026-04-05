# my-jobs-eight — CLAUDE.md

## Project Overview

Remote design job board with automated application engine. Scrapes 10 job boards for design/UX/Figma jobs and auto-applies via Playwright.

## Architecture

- `app/api/scrape/route.ts` — scrapes all job boards and upserts to DB
- `app/api/jobs/route.ts` — returns jobs from DB
- `app/api/apply/route.ts` — triggers auto-apply run (POST) or lists applications (GET)
- `app/api/cover-letter/route.ts` — AI cover letter generation
- `app/page.tsx` — client-side job listing UI
- `lib/db.ts` — Neon Postgres helpers
- `lib/scrapers/` — per-board scraper modules (WWR, RemoteOK, Remotive, LinkedIn, Indeed, Dice, Monster, FlexJobs, UIUXJobsBoard, RemoteJobs)
- `lib/apply/engine.ts` — auto-apply engine (fetches un-applied jobs, filters, runs Playwright)
- `lib/apply/ats/` — ATS-specific form fillers (Greenhouse, Lever, Workday, generic)
- `lib/apply/profile.ts` — Chris's profile data for form filling
- `lib/apply/cover-letter.ts` — AI cover letter generation via Claude API
- `lib/notify.ts` — notifications (Slack, Discord, email via Resend, Paperclip tasks)
- `scripts/run-apply.ts` — CLI entry point for auto-apply (used by GitHub Actions)

## Environment

Requires `DATABASE_URL` (Neon Postgres). Pull from Vercel:

```bash
vercel env pull .env.local
```

Other env vars: `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `NOTIFICATION_EMAIL`, `DISCORD_WEBHOOK_URL`, `SLACK_WEBHOOK_URL`, `CRON_SECRET`.

## Cron / Automation

- Vercel Cron runs `/api/scrape` daily (Hobby plan limit)
- GitHub Actions: `scrape.yml` runs every 30 min, `auto-apply.yml` runs hourly with limit=50
- Auto-apply runs Playwright in CI (not Vercel serverless — Playwright needs a real browser)

## Auto-Apply Flow

1. `scripts/run-apply.ts` fetches un-applied jobs from DB
2. Filters by title match + salary floor (see `lib/apply/profile.ts`)
3. For each eligible job: generates AI cover letter, opens Playwright, finds apply URL
4. Detects ATS platform (Greenhouse, Lever, Workday, or generic)
5. Fills form fields, uploads resume + cover letter, submits
6. Records result in `applications` table and marks `jobs.applied_at`
7. Sends notifications (email, Slack, Discord)

## Key Files

- `vercel.json` — cron config
- `supabase/migrations/` — DB schema migrations
- `.github/workflows/auto-apply.yml` — hourly auto-apply CI job
- `.github/workflows/scrape.yml` — scrape CI job
