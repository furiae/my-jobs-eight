import type { ScrapedJob } from "./remoteok";

/**
 * Scrapes Dice's public job search API for remote design/UX roles.
 * Uses Dice's public search API — no auth required.
 */

const SEARCH_QUERIES = [
  "UX designer",
  "product designer",
  "UI designer",
  "Figma designer",
];

interface DiceJob {
  id?: string;
  title?: string;
  companyName?: string;
  employerType?: string;
  postedDate?: string;
  detailsPageUrl?: string;
  salary?: string;
  modifiedDate?: string;
  jobLocation?: {
    displayName?: string;
  };
  summary?: string;
}

interface DiceResponse {
  data?: DiceJob[];
  count?: number;
}

export async function scrapeDice(): Promise<ScrapedJob[]> {
  const allJobs: ScrapedJob[] = [];
  const seenUrls = new Set<string>();

  for (const query of SEARCH_QUERIES) {
    try {
      const params = new URLSearchParams({
        q: query,
        countryCode2: "US",
        radius: "30",
        radiusUnit: "mi",
        page: "1",
        pageSize: "20",
        facets: "employmentType|postedDate|workFromHomeAvailability",
        filters: "workFromHomeAvailability|TRUE",
        language: "en",
      });

      const res = await fetch(
        `https://job-search-api.svc.dhigroupinc.com/v1/dice/jobs/search?${params.toString()}`,
        {
          headers: {
            "User-Agent": "my-jobs-eight/1.0",
            "x-api-key": "1YAt0R9wBg4WfsF9VB2778F5CHLAPMVN3WAZcKd8",
            Accept: "application/json",
          },
        }
      );

      if (!res.ok) continue;

      const data: DiceResponse = await res.json();
      const jobs = data.data || [];

      for (const job of jobs) {
        const jobUrl = job.detailsPageUrl
          ? (job.detailsPageUrl.startsWith("http")
            ? job.detailsPageUrl
            : `https://www.dice.com${job.detailsPageUrl}`)
          : `https://www.dice.com/job-detail/${job.id}`;

        if (seenUrls.has(jobUrl)) continue;
        seenUrls.add(jobUrl);

        allJobs.push({
          url: jobUrl,
          title: job.title || "",
          company: job.companyName || "",
          salary: job.salary || null,
          location: job.jobLocation?.displayName || "Remote",
          description: job.summary?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "",
          source: "Dice",
          posted_at: job.postedDate ? new Date(job.postedDate).toISOString() : null,
        });
      }
    } catch {
      // skip failing queries
    }
  }

  return allJobs;
}
