import type { ScrapedJob } from "./remoteok";

const DESIGN_KEYWORDS = ["design", "ux", "ui", "figma", "product designer", "web designer"];

function matchesDesign(title: string, tags: string[]): boolean {
  const lower = title.toLowerCase();
  if (DESIGN_KEYWORDS.some((kw) => lower.includes(kw))) return true;
  return tags.some((tag) => DESIGN_KEYWORDS.some((kw) => tag.toLowerCase().includes(kw)));
}

export async function scrapeRemoteJobs(): Promise<ScrapedJob[]> {
  // RemoteJobs.io exposes a public JSON feed at /api/jobs
  const res = await fetch(
    "https://remotejobs.io/api/jobs?category=design&limit=50",
    { headers: { "User-Agent": "my-jobs-eight/1.0" } }
  );

  if (!res.ok) throw new Error(`RemoteJobs.io fetch failed: ${res.status}`);

  const data = await res.json();
  const jobs: { title: string; url: string; company: string; salary?: string; tags?: string[]; description?: string; createdAt?: string }[] =
    Array.isArray(data) ? data : (data.jobs ?? data.data ?? []);

  return jobs
    .filter((job) => matchesDesign(job.title ?? "", job.tags ?? []))
    .map((job) => ({
      url: job.url ?? "",
      title: job.title ?? "",
      company: job.company ?? "",
      salary: job.salary ?? null,
      location: "Remote",
      description: job.description ?? "",
      source: "RemoteJobs.io",
      posted_at: job.createdAt ? new Date(job.createdAt).toISOString() : null,
    }));
}
