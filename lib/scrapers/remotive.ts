import type { ScrapedJob } from "./types";

const DESIGN_CATEGORIES = ["design", "product"];

const DESIGN_KEYWORDS = [
  "designer",
  "ux",
  "ui",
  "figma",
  "design lead",
  "design manager",
  "design director",
  "creative director",
];

function isDesignJob(title: string): boolean {
  const lower = title.toLowerCase();
  return DESIGN_KEYWORDS.some((kw) => lower.includes(kw));
}

function mapJob(job: Record<string, unknown>): ScrapedJob {
  return {
    url: job.url as string,
    title: job.title as string,
    company: job.company_name as string,
    salary: (job.salary as string) || null,
    location: (job.candidate_required_location as string) || "Remote",
    description: (job.description as string) || "",
    source: "Remotive",
    posted_at: job.publication_date
      ? new Date(job.publication_date as string).toISOString()
      : null,
  };
}

export async function scrapeRemotive(): Promise<ScrapedJob[]> {
  const seen = new Set<string>();
  const results: ScrapedJob[] = [];

  function addJob(job: Record<string, unknown>) {
    const url = job.url as string;
    if (seen.has(url)) return;
    seen.add(url);
    results.push(mapJob(job));
  }

  // 1. Fetch by design-related categories
  for (const category of DESIGN_CATEGORIES) {
    try {
      const res = await fetch(
        `https://remotive.com/api/remote-jobs?category=${category}&limit=50`
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const job of data.jobs || []) {
        addJob(job);
      }
    } catch {
      // skip failing requests
    }
  }

  // 2. Search by design keywords to catch jobs in other categories
  for (const keyword of ["designer", "ux", "figma"]) {
    try {
      const res = await fetch(
        `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(keyword)}&limit=50`
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const job of data.jobs || []) {
        if (isDesignJob(job.title as string)) {
          addJob(job);
        }
      }
    } catch {
      // skip failing requests
    }
  }

  return results;
}
