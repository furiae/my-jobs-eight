import type { ScrapedJob } from "./remoteok";

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

function isDesignJob(title: string, categories: string[]): boolean {
  const lower = title.toLowerCase();
  if (DESIGN_KEYWORDS.some((kw) => lower.includes(kw))) return true;
  return categories.some((cat) =>
    DESIGN_CATEGORIES.some((dc) => cat.toLowerCase().includes(dc))
  );
}

function formatSalary(
  min?: number,
  max?: number,
  currency?: string
): string | null {
  if (!min && !max) return null;
  const cur = currency ?? "USD";
  if (min && max) return `${cur} ${min}-${max}`;
  if (min) return `${cur} ${min}+`;
  return `${cur} up to ${max}`;
}

interface HimalayasJob {
  title: string;
  excerpt: string;
  description: string;
  companyName: string;
  applicationLink: string;
  guid: string;
  employmentType: string;
  minSalary?: number;
  maxSalary?: number;
  currency?: string;
  categories: string[];
  parentCategories: string[];
  locationRestrictions?: string[];
  pubDate: string;
  expiryDate?: string;
}

export async function scrapeHimalayas(): Promise<ScrapedJob[]> {
  const seen = new Set<string>();
  const results: ScrapedJob[] = [];

  function addJob(job: HimalayasJob) {
    const url =
      job.applicationLink ||
      `https://himalayas.app/jobs/${job.guid}`;
    if (seen.has(url)) return;
    seen.add(url);
    results.push({
      url,
      title: job.title,
      company: job.companyName,
      salary: formatSalary(job.minSalary, job.maxSalary, job.currency),
      location:
        job.locationRestrictions?.join(", ") || "Remote",
      description: job.excerpt || "",
      source: "Himalayas",
      posted_at: job.pubDate
        ? new Date(job.pubDate).toISOString()
        : null,
    });
  }

  // Search by design-related keywords
  for (const keyword of ["designer", "ux", "figma", "design"]) {
    try {
      const res = await fetch(
        `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(keyword)}&sort=recent&page=1`,
        { headers: { "User-Agent": "my-jobs-eight/1.0" } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const jobs: HimalayasJob[] = data.jobs ?? [];
      for (const job of jobs) {
        const allCategories = [
          ...(job.categories ?? []),
          ...(job.parentCategories ?? []),
        ];
        if (isDesignJob(job.title, allCategories)) {
          addJob(job);
        }
      }
    } catch {
      // skip failing requests
    }
  }

  return results;
}
