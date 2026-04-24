/**
 * Ashby Boards scraper.
 *
 * Fetches design jobs from Ashby's public posting API for companies that use it.
 * Each company's public job board is at:
 *   https://api.ashbyhq.com/posting-api/job-board/{companySlug}
 *
 * Structured JSON — no browser needed, no auth required.
 */

import type { ScrapedJob } from "./types";

// Companies known to use Ashby and hire product/UX designers
// Verified 2026-04-24 — do not add companies already on Greenhouse to avoid duplicates
const ASHBY_COMPANIES = [
  { slug: "openai", name: "OpenAI" },
  { slug: "deel", name: "Deel" },
  { slug: "notion", name: "Notion" },
  { slug: "ramp", name: "Ramp" },
  { slug: "replit", name: "Replit" },
  { slug: "elevenlabs", name: "ElevenLabs" },
  { slug: "synthesia", name: "Synthesia" },
  { slug: "runway", name: "Runway" },
  { slug: "linear", name: "Linear" },
  { slug: "cursor", name: "Cursor" },
  { slug: "perplexity", name: "Perplexity" },
  { slug: "posthog", name: "PostHog" },
  { slug: "sanity", name: "Sanity" },
  { slug: "granola", name: "Granola" },
  { slug: "benchling", name: "Benchling" },
  { slug: "leapsome", name: "Leapsome" },
  { slug: "stytch", name: "Stytch" },
  { slug: "mercury", name: "Mercury" },
  { slug: "superhuman", name: "Superhuman" },
  { slug: "loom", name: "Loom" },
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
  "figma",
  "web designer",
  "brand designer",
  "creative director",
  "design systems",
  "design engineer",
  "creative producer",
];

function isDesignRole(title: string): boolean {
  const lower = title.toLowerCase();
  return DESIGN_KEYWORDS.some((kw) => lower.includes(kw));
}

interface AshbyJob {
  id: string;
  title: string;
  department: string;
  team?: string;
  employmentType?: string;
  location?: string;
  isRemote?: boolean;
  workplaceType?: string;
  publishedAt?: string;
  jobUrl: string;
  applyUrl?: string;
  descriptionPlain?: string;
  compensation?: {
    summaryComponents?: Array<{
      compensationType: string;
      minValue?: number;
      maxValue?: number;
      currency?: string;
      interval?: string;
    }>;
  };
}

async function scrapeCompany(
  slug: string,
  companyName: string
): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];

  try {
    const res = await fetch(
      `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      }
    );

    if (!res.ok) return results;

    const data: { jobs?: AshbyJob[] } = await res.json();
    const jobs = data.jobs ?? [];

    for (const job of jobs) {
      if (!isDesignRole(job.title)) continue;

      // Build salary string from compensation components
      let salary: string | null = null;
      const comp = job.compensation?.summaryComponents?.find(
        (c) => c.compensationType === "Salary" || c.compensationType === "Base Salary"
      );
      if (comp?.minValue && comp?.maxValue) {
        const currency = comp.currency || "USD";
        salary = `${currency} ${Math.round(comp.minValue / 1000)}k–${Math.round(comp.maxValue / 1000)}k`;
      }

      results.push({
        url: job.jobUrl,
        title: job.title,
        company: companyName,
        salary,
        location: job.location || (job.isRemote ? "Remote" : ""),
        description: "",
        source: "Ashby",
        posted_at: job.publishedAt ?? null,
      });
    }
  } catch {
    // skip failing companies
  }

  return results;
}

export async function scrapeAshbyBoards(): Promise<ScrapedJob[]> {
  const allJobs: ScrapedJob[] = [];
  const seen = new Set<string>();

  const batchSize = 10;
  for (let i = 0; i < ASHBY_COMPANIES.length; i += batchSize) {
    const batch = ASHBY_COMPANIES.slice(i, i + batchSize);
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
