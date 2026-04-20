import type { ScrapedJob } from "./types";

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
  "interaction design",
];

function isDesignJob(title: string, tags: string): boolean {
  const text = `${title} ${tags}`.toLowerCase();
  return DESIGN_KEYWORDS.some((kw) => text.includes(kw));
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

interface WorkingNomadsJob {
  url: string;
  title: string;
  description: string;
  company_name: string;
  category_name: string;
  tags: string;
  location: string;
  pub_date: string;
}

export async function scrapeWorkingNomads(): Promise<ScrapedJob[]> {
  const res = await fetch("https://www.workingnomads.com/api/exposed_jobs/", {
    headers: { "User-Agent": "my-jobs-eight/1.0" },
  });

  if (!res.ok) {
    throw new Error(`Working Nomads API returned ${res.status}`);
  }

  const jobs: WorkingNomadsJob[] = await res.json();

  return jobs
    .filter((job) => isDesignJob(job.title, job.tags))
    .map((job) => ({
      url: job.url,
      title: job.title,
      company: job.company_name,
      salary: null,
      location: job.location || "Remote",
      description: stripHtml(job.description).slice(0, 500),
      source: "Working Nomads",
      posted_at: job.pub_date ? new Date(job.pub_date).toISOString() : null,
    }));
}
