/**
 * Lever Boards scraper.
 *
 * Fetches design jobs from Lever's public postings API for top companies.
 * Each company's public job board is at:
 *   https://api.lever.co/v0/postings/{company}?mode=json
 *
 * Structured JSON — no browser needed, no auth required.
 */

import type { ScrapedJob } from "./remoteok";

// Companies known to use Lever and hire product/UX designers
const LEVER_COMPANIES = [
  { slug: "netflix", name: "Netflix" },
  { slug: "twitch", name: "Twitch" },
  { slug: "reddit", name: "Reddit" },
  { slug: "figma", name: "Figma" },
  { slug: "netlify", name: "Netlify" },
  { slug: "postman", name: "Postman" },
  { slug: "lever", name: "Lever" },
  { slug: "segment", name: "Segment" },
  { slug: "auth0", name: "Auth0" },
  { slug: "github", name: "GitHub" },
  { slug: "shopify", name: "Shopify" },
  { slug: "atlassian", name: "Atlassian" },
  { slug: "asana", name: "Asana" },
  { slug: "noom", name: "Noom" },
  { slug: "wealthsimple", name: "Wealthsimple" },
  { slug: "grammarly", name: "Grammarly" },
  { slug: "razorpay", name: "Razorpay" },
  { slug: "intercom", name: "Intercom" },
  { slug: "mixpanel", name: "Mixpanel" },
  { slug: "samsara", name: "Samsara" },
  { slug: "cloudflare", name: "Cloudflare" },
  { slug: "amplitude", name: "Amplitude" },
  { slug: "pagerduty", name: "PagerDuty" },
  { slug: "snyk", name: "Snyk" },
  { slug: "onepassword", name: "1Password" },
  { slug: "grafana-labs", name: "Grafana Labs" },
  { slug: "mux", name: "Mux" },
  { slug: "livekit", name: "LiveKit" },
  { slug: "temporal-technologies", name: "Temporal" },
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
];

function isDesignRole(title: string): boolean {
  const lower = title.toLowerCase();
  return DESIGN_KEYWORDS.some((kw) => lower.includes(kw));
}

interface LeverPosting {
  id: string;
  text: string; // job title
  hostedUrl: string;
  applyUrl: string;
  categories: {
    commitment?: string;
    department?: string;
    location?: string;
    team?: string;
  };
  createdAt: number;
  descriptionPlain?: string;
  additional?: string;
  salaryRange?: {
    min?: number;
    max?: number;
    currency?: string;
    interval?: string;
  };
}

async function scrapeCompany(
  slug: string,
  companyName: string
): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];

  try {
    const res = await fetch(
      `https://api.lever.co/v0/postings/${slug}?mode=json`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      }
    );

    if (!res.ok) return results;

    const postings: LeverPosting[] = await res.json();

    for (const posting of postings) {
      if (!isDesignRole(posting.text)) continue;

      let salary: string | null = null;
      if (posting.salaryRange?.min && posting.salaryRange?.max) {
        const currency = posting.salaryRange.currency || "USD";
        salary = `${currency} ${posting.salaryRange.min}-${posting.salaryRange.max}`;
      }

      results.push({
        url: posting.hostedUrl || `https://jobs.lever.co/${slug}/${posting.id}`,
        title: posting.text,
        company: companyName,
        salary,
        location: posting.categories?.location || "Remote",
        description: "",
        source: "Lever",
        posted_at: posting.createdAt
          ? new Date(posting.createdAt).toISOString()
          : null,
      });
    }
  } catch {
    // skip failing companies
  }

  return results;
}

export async function scrapeLeverBoards(): Promise<ScrapedJob[]> {
  const allJobs: ScrapedJob[] = [];
  const seen = new Set<string>();

  const batchSize = 10;
  for (let i = 0; i < LEVER_COMPANIES.length; i += batchSize) {
    const batch = LEVER_COMPANIES.slice(i, i + batchSize);
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
