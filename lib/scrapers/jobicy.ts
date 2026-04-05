import type { ScrapedJob } from "./remoteok";

const DESIGN_KEYWORDS = ["design", "ux", "ui", "figma", "product designer", "web designer", "creative"];

function matchesDesign(title: string, tags: string[]): boolean {
  const lower = title.toLowerCase();
  if (DESIGN_KEYWORDS.some((kw) => lower.includes(kw))) return true;
  return tags.some((tag) => DESIGN_KEYWORDS.some((kw) => tag.toLowerCase().includes(kw)));
}

interface JobicyJob {
  id: number;
  url: string;
  jobTitle: string;
  companyName: string;
  jobIndustry: string[];
  jobType: string[];
  jobGeo: string;
  jobLevel: string;
  jobExcerpt: string;
  pubDate: string;
  annualSalaryMin?: string;
  annualSalaryMax?: string;
  salaryCurrency?: string;
}

export async function scrapeJobicy(): Promise<ScrapedJob[]> {
  const res = await fetch(
    "https://jobicy.com/api/v2/remote-jobs?count=50&industry=design-multimedia",
    { headers: { "User-Agent": "my-jobs-eight/1.0" } }
  );

  if (!res.ok) throw new Error(`Jobicy fetch failed: ${res.status}`);

  const data = await res.json();
  const jobs: JobicyJob[] = data.jobs ?? [];

  return jobs
    .filter((job) => matchesDesign(job.jobTitle ?? "", job.jobIndustry ?? []))
    .map((job) => {
      let salary: string | null = null;
      if (job.annualSalaryMin && job.annualSalaryMax) {
        const currency = job.salaryCurrency ?? "USD";
        salary = `${currency} ${job.annualSalaryMin}-${job.annualSalaryMax}`;
      }

      return {
        url: job.url ?? "",
        title: job.jobTitle ?? "",
        company: job.companyName ?? "",
        salary,
        location: job.jobGeo ?? "Remote",
        description: job.jobExcerpt ?? "",
        source: "Jobicy",
        posted_at: job.pubDate ? new Date(job.pubDate).toISOString() : null,
      };
    });
}
