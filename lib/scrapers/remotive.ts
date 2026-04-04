import type { ScrapedJob } from "./remoteok";

const DESIGN_CATEGORIES = ["design", "product"];

export async function scrapeRemotive(): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];

  for (const category of DESIGN_CATEGORIES) {
    try {
      const res = await fetch(
        `https://remotive.com/api/remote-jobs?category=${category}&limit=50`
      );
      if (!res.ok) continue;
      const data = await res.json();
      const jobs = data.jobs || [];

      for (const job of jobs) {
        results.push({
          url: job.url,
          title: job.title,
          company: job.company_name,
          salary: job.salary || null,
          location: job.candidate_required_location || "Remote",
          description: job.description || "",
          source: "Remotive",
          posted_at: job.publication_date
            ? new Date(job.publication_date).toISOString()
            : null,
        });
      }
    } catch {
      // skip failing requests
    }
  }

  return results;
}
