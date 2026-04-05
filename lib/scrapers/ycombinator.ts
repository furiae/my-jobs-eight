import type { ScrapedJob } from "./remoteok";

const DESIGN_KEYWORDS = [
  "designer",
  "ux",
  "ui",
  "figma",
  "design lead",
  "design manager",
  "design director",
  "creative director",
  "product design",
  "visual design",
];

function isDesignJob(title: string): boolean {
  const lower = title.toLowerCase();
  return DESIGN_KEYWORDS.some((kw) => lower.includes(kw));
}

interface YCJob {
  id: number;
  company_name: string;
  title: string;
  description: string;
  url: string;
  remote: boolean;
  created_at: string;
  salary_min?: number;
  salary_max?: number;
}

export async function scrapeYCombinator(): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];
  const seen = new Set<string>();

  try {
    // Algolia-powered search used by workatastartup.com
    const res = await fetch(
      "https://45bwzj1sgc-dsn.algolia.net/1/indexes/WAtS_jobs/query",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Algolia-Application-Id": "45BWZJ1SGC",
          "X-Algolia-API-Key": "MjBjYjRiMzY0NzdhZWY0NjExY2NhZjYxMGIxYjc2MTAwNWFkNTkwNTc4NjgxYjU0YzFhYTY2ZGQ5OGY5NDMzZnJlc3RyaWN0SW5kaWNlcz0lNUIlMjJXQXRTX2pvYnMlMjIlMkMlMjJXQXRTX2pvYnNfcHJvZHVjdGlvbiUyMiU1RCZ0YWdGaWx0ZXJzPSU1QiUyMmhpcmluZ19ub3RlcyUyMiU1RCZhbmFseXRpY3NUYWdzPSU1QiUyMndhcy1qb2JzLXF1ZXJ5JTIyJTVE",
        },
        body: JSON.stringify({
          query: "designer",
          hitsPerPage: 50,
          facetFilters: [["remote:true"]],
        }),
      }
    );

    if (!res.ok) return results;

    const data = await res.json();
    const hits: YCJob[] = data.hits ?? [];

    for (const hit of hits) {
      if (!isDesignJob(hit.title ?? "")) continue;

      const url =
        hit.url ||
        `https://www.workatastartup.com/jobs/${hit.id}`;

      if (seen.has(url)) continue;
      seen.add(url);

      let salary: string | null = null;
      if (hit.salary_min && hit.salary_max) {
        salary = `USD ${hit.salary_min}-${hit.salary_max}`;
      }

      results.push({
        url,
        title: hit.title,
        company: hit.company_name ?? "",
        salary,
        location: "Remote",
        description: (hit.description ?? "")
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 500),
        source: "Y Combinator",
        posted_at: hit.created_at
          ? new Date(hit.created_at).toISOString()
          : null,
      });
    }
  } catch {
    // skip
  }

  return results;
}
