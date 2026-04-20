/**
 * Greenhouse Boards scraper.
 *
 * Fetches design jobs from Greenhouse's public JSON API for top companies.
 * Each company's public job board is at:
 *   https://boards-api.greenhouse.io/v1/boards/{company}/jobs
 *
 * This returns structured JSON — no browser needed, no auth required.
 */

import type { ScrapedJob } from "./remoteok";

// Companies known to use Greenhouse and hire product/UX designers
const GREENHOUSE_COMPANIES = [
  { slug: "figma", name: "Figma" },
  { slug: "discord", name: "Discord" },
  { slug: "gusto", name: "Gusto" },
  { slug: "gitlab", name: "GitLab" },
  { slug: "affirm", name: "Affirm" },
  { slug: "airbnb", name: "Airbnb" },
  { slug: "airtable", name: "Airtable" },
  { slug: "webflow", name: "Webflow" },
  { slug: "vercel", name: "Vercel" },
  { slug: "notion", name: "Notion" },
  { slug: "stripe", name: "Stripe" },
  { slug: "squarespace", name: "Squarespace" },
  { slug: "canva", name: "Canva" },
  { slug: "plaid", name: "Plaid" },
  { slug: "brex", name: "Brex" },
  { slug: "coinbase", name: "Coinbase" },
  { slug: "duolingo", name: "Duolingo" },
  { slug: "lyft", name: "Lyft" },
  { slug: "pinterest", name: "Pinterest" },
  { slug: "datadog", name: "Datadog" },
  { slug: "ramp", name: "Ramp" },
  { slug: "linear", name: "Linear" },
  { slug: "retool", name: "Retool" },
  { slug: "dbt-labs", name: "dbt Labs" },
  { slug: "supabase", name: "Supabase" },
  { slug: "loom", name: "Loom" },
  { slug: "miro", name: "Miro" },
  { slug: "anthropic", name: "Anthropic" },
  { slug: "openai", name: "OpenAI" },
  { slug: "hashicorp", name: "HashiCorp" },
  { slug: "elastic", name: "Elastic" },
  { slug: "hubspot", name: "HubSpot" },
  { slug: "doordash", name: "DoorDash" },
  { slug: "instacart", name: "Instacart" },
  { slug: "robinhood", name: "Robinhood" },
  { slug: "chime", name: "Chime" },
  { slug: "mercury", name: "Mercury" },
  { slug: "deel", name: "Deel" },
  { slug: "rippling", name: "Rippling" },
  { slug: "calendly", name: "Calendly" },
];

const DESIGN_KEYWORDS = [
  "product designer",
  "ux designer",
  "ui designer",
  "ux/ui",
  "ui/ux",
  "design lead",
  "design manager",
  "design director",
  "visual designer",
  "interaction designer",
  "experience designer",
  "web designer",
  "brand designer",
  "creative director",
  "design systems",
  "design engineer",
];

function isDesignRole(title: string): boolean {
  const lower = title.toLowerCase();
  return DESIGN_KEYWORDS.some((kw) => lower.includes(kw));
}

interface GreenhouseJob {
  id: number;
  title: string;
  location: { name: string };
  updated_at: string;
  absolute_url: string;
  metadata?: { id: number; name: string; value: string | null }[];
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

async function scrapeCompany(
  slug: string,
  companyName: string
): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];

  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      }
    );

    if (!res.ok) return results;

    const data: GreenhouseResponse = await res.json();

    for (const job of data.jobs) {
      if (!isDesignRole(job.title)) continue;

      const url =
        job.absolute_url ||
        `https://boards.greenhouse.io/${slug}/jobs/${job.id}`;

      results.push({
        url,
        title: job.title,
        company: companyName,
        salary: null,
        location: job.location?.name || "Remote",
        description: "",
        source: "Greenhouse",
        posted_at: job.updated_at
          ? new Date(job.updated_at).toISOString()
          : null,
      });
    }
  } catch {
    // skip failing companies
  }

  return results;
}

export async function scrapeGreenhouseBoards(): Promise<ScrapedJob[]> {
  const allJobs: ScrapedJob[] = [];
  const seen = new Set<string>();

  // Fetch all companies in parallel (batches of 10 to avoid overwhelming)
  const batchSize = 10;
  for (let i = 0; i < GREENHOUSE_COMPANIES.length; i += batchSize) {
    const batch = GREENHOUSE_COMPANIES.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((c) => scrapeCompany(c.slug, c.name))
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        for (const job of result.value) {
          if (!seen.has(job.url)) {
            seen.add(job.url);
            allJobs.push(job);
          }
        }
      }
    }
  }

  return allJobs;
}
