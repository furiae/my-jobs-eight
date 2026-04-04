# my-jobs-eight — CLAUDE.md

## Project Overview

Remote design job board. Scrapes WeWorkRemotely, RemoteOK, and Remotive for design/UX/Figma jobs.

## Architecture

- `app/api/scrape/route.ts` — scrapes all job boards and upserts to DB
- `app/api/jobs/route.ts` — returns jobs from DB
- `app/page.tsx` — client-side job listing UI
- `lib/db.ts` — Neon Postgres helpers
- `lib/scrapers/` — per-board scraper modules

## Environment

Requires `DATABASE_URL` (Neon Postgres). Pull from Vercel:

```bash
vercel env pull .env.local
```

## Cron

Vercel Cron runs `/api/scrape` daily (Hobby plan limit). To run more often, use GitHub Actions.

## Key Files

- `vercel.json` — cron config
- `supabase/migrations/0001_init.sql` — schema (apply to Neon DB if starting fresh)
