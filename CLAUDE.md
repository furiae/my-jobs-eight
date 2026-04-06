# my-jobs-eight — CLAUDE.md

## Project Overview

Remote design job board with automated application engine. Scrapes 10 job boards for design/UX/Figma jobs and auto-applies via Playwright.

## Architecture

- `app/api/scrape/route.ts` — scrapes all job boards and upserts to DB
- `app/api/jobs/route.ts` — returns jobs from DB
- `app/api/apply/route.ts` — triggers auto-apply run (POST) or lists applications (GET)
- `app/api/cover-letter/route.ts` — AI cover letter generation
- `app/api/notify-blocked/route.ts` — POST: sends Slack notification for blocked tasks (auth: CRON_SECRET)
- `app/api/notify-complete/route.ts` — POST: sends Slack notification for completed tasks (auth: CRON_SECRET)
- `app/api/slack/events/route.ts` — POST: Slack Events API webhook; routes thread replies back to Paperclip as issue comments
- `app/page.tsx` — client-side job listing UI with "New Jobs" / "Applied Jobs" tabs
- `lib/db.ts` — Neon Postgres helpers
- `lib/scrapers/` — per-board scraper modules (WWR, RemoteOK, Remotive, LinkedIn, Indeed, Dice, Monster, FlexJobs, UIUXJobsBoard, RemoteJobs)
- `lib/apply/engine.ts` — auto-apply engine (fetches un-applied jobs, filters, runs Playwright)
- `lib/apply/ats/` — ATS-specific form fillers (Greenhouse, Lever, Workday, Ashby, generic)
- `lib/apply/profile.ts` — Chris's profile data for form filling
- `lib/apply/cover-letter.ts` — AI cover letter generation via Claude API
- `lib/notify.ts` — notifications (Slack, Discord, email via Resend — secondary; primary tracking is in-app UI)
- `lib/slack.ts` — general-purpose Slack messaging (recommendations, alerts, blocked-task notifications, deploy notifications)
- `scripts/notify-blocked.ts` — CLI to send Slack notification for blocked tasks
- `scripts/run-apply.ts` — CLI entry point for auto-apply (used by GitHub Actions)

## Environment

Requires `DATABASE_URL` (Neon Postgres). Pull from Vercel:

```bash
vercel env pull .env.local
```

Other env vars: `ANTHROPIC_API_KEY`, `CRON_SECRET`. Optional: `RESEND_API_KEY`, `NOTIFICATION_EMAIL`, `DISCORD_WEBHOOK_URL`, `SLACK_WEBHOOK_URL`. Slack Bot API: `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID` (used for both auto-apply notifications and general agent alerts). Two-way Slack: `SLACK_SIGNING_SECRET` (verifies incoming Slack events).

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
7. Applied jobs appear in the "Applied Jobs" tab in the web UI with green checkmark and timestamp

## Styling

- Tailwind CSS v3.4 with PostCSS
- `tailwind.config.js` — content paths: `app/`, `components/`, `lib/`
- `postcss.config.mjs` — PostCSS with Tailwind plugin
- `app/globals.css` — Tailwind directives (`@tailwind base/components/utilities`)
- Next.js 16 with Turbopack (default bundler)

## Key Files

- `tailwind.config.js` — Tailwind content config (required for CSS generation)
- `vercel.json` — cron config
- `supabase/migrations/` — DB schema migrations
- `.github/workflows/auto-apply.yml` — hourly auto-apply CI job
- `.github/workflows/scrape.yml` — scrape CI job

## MCP Servers

Project-level MCP config in `.mcp.json`:
- **Playwright MCP** (`@playwright/mcp`) — browser automation by Microsoft. Used for ATS form-filling and site validation.
- **Firecrawl MCP** (`firecrawl-mcp`) — structured web scraping by Mendable AI. Requires `FIRECRAWL_API_KEY`. Improves apply URL extraction.

Security-rejected MCP skills (do not install):
- LinkedIn Scraper MCP — violates LinkedIn ToS, stores session cookies, single-maintainer risk
- BrowserTools MCP — explicitly deprecated by author, abandoned since March 2025
- Hyperbrowser MCP — inactive 13+ months, cloud-routed data with less transparency

## CTO Process: Recommendations

When the CTO agent has tool/MCP/process recommendations:
1. Create a Paperclip issue for each recommendation (assigned to board user)
2. Send a Slack notification via `lib/slack.ts` so board gets notified
3. Include security assessment, pros/cons, and plain-English explanation

## Known Issues

- Auto-apply success rate is low (~7.5%) — most jobs result in `manual_required` due to missing apply URLs
- DataAnnotation listings are spam/low-quality — should be filtered
- Email notifications (Resend) may not be configured — see FUR-108
