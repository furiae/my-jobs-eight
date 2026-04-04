# my-jobs-eight

Remote design job board for Product Designer, UX Designer, Figma, and Web Designer roles.

## Stack

- **Next.js 15** (App Router)
- **Neon Postgres** (via `@neondatabase/serverless`)
- **Tailwind CSS**
- **Vercel** (hosting + daily cron)

## Features

- Scrapes WeWorkRemotely, Remote OK, and Remotive for design/UX jobs
- Stores jobs in Neon Postgres with deduplication by URL
- Daily auto-scrape via Vercel Cron
- Filter by job board / title

## Development

```bash
cp .env.local.example .env.local
# Fill in your Neon DATABASE_URL

npm install
npm run dev
```

## API

- `GET /api/jobs` — list jobs (`?limit=50&offset=0&source=Remote+OK`)
- `GET /api/scrape` — trigger manual scrape (also called by Vercel Cron daily)

## Deployment

Linked to Vercel project `my-jobs` under `furiaes-projects`. Push to `main` to deploy.
