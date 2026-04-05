import type { ScrapedJob } from "./remoteok";

/**
 * Scrapes LinkedIn's guest-facing jobs API for remote design/UX roles.
 * No auth required — uses the public jobs search endpoint.
 */

const SEARCH_QUERIES = [
  "remote+UX+designer",
  "remote+product+designer",
  "remote+UI+designer",
  "remote+figma+designer",
];

interface LinkedInJobRaw {
  title?: string;
  companyName?: string;
  location?: string;
  url?: string;
  postedAt?: string;
  salary?: string;
  description?: string;
}

function extractJobsFromHTML(html: string): LinkedInJobRaw[] {
  const jobs: LinkedInJobRaw[] = [];

  // LinkedIn guest jobs page uses <li> with base-card class
  const cards = html.match(/<div[^>]*class="[^"]*base-card[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g) || [];

  for (const card of cards) {
    const title = (card.match(/<h3[^>]*class="[^"]*base-search-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/) ||
      card.match(/<span[^>]*class="[^"]*sr-only[^"]*"[^>]*>([\s\S]*?)<\/span>/))?.[1]?.trim() ?? "";
    const company = card.match(/<h4[^>]*class="[^"]*base-search-card__subtitle[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)?.[1]?.trim() ?? "";
    const location = card.match(/<span[^>]*class="[^"]*job-search-card__location[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1]?.trim() ?? "";
    const link = card.match(/<a[^>]*class="[^"]*base-card__full-link[^"]*"[^>]*href="([^"]*)"/) ?.[1]?.trim() ?? "";
    const time = card.match(/<time[^>]*datetime="([^"]*)"/) ?.[1]?.trim() ?? "";

    if (!title || !link) continue;

    jobs.push({
      title,
      companyName: company,
      location: location || "Remote",
      url: link.split("?")[0], // strip tracking params
      postedAt: time || undefined,
      description: "",
    });
  }

  return jobs;
}

export async function scrapeLinkedIn(): Promise<ScrapedJob[]> {
  const allJobs: ScrapedJob[] = [];
  const seenUrls = new Set<string>();

  for (const query of SEARCH_QUERIES) {
    try {
      const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${query}&location=&f_WT=2&start=0`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html",
        },
      });

      if (!res.ok) continue;

      const html = await res.text();
      const rawJobs = extractJobsFromHTML(html);

      for (const job of rawJobs) {
        const jobUrl = job.url || "";
        if (!jobUrl || seenUrls.has(jobUrl)) continue;
        seenUrls.add(jobUrl);

        allJobs.push({
          url: jobUrl,
          title: job.title || "",
          company: job.companyName || "",
          salary: job.salary || null,
          location: job.location || "Remote",
          description: job.description || "",
          source: "LinkedIn",
          posted_at: job.postedAt ? new Date(job.postedAt).toISOString() : null,
        });
      }
    } catch {
      // skip failing queries
    }
  }

  return allJobs;
}
