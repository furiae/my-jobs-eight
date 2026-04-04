export interface ScrapedJob {
  url: string;
  title: string;
  company: string;
  salary: string | null;
  location: string;
  description: string;
  source: string;
  posted_at: string | null;
}

export async function scrapeRemoteOK(): Promise<ScrapedJob[]> {
  const res = await fetch("https://remoteok.com/api", {
    headers: { "User-Agent": "my-jobs-eight/1.0" },
  });

  if (!res.ok) throw new Error(`RemoteOK fetch failed: ${res.status}`);

  const data = await res.json();
  // First element is a legal notice object, skip it
  const jobs = data.slice(1);

  const designKeywords = [
    "design",
    "ux",
    "ui",
    "figma",
    "product designer",
    "web designer",
  ];

  return jobs
    .filter((job: Record<string, unknown>) => {
      const title = String(job.position || "").toLowerCase();
      const tags = (job.tags as string[] || []).map((t) => t.toLowerCase());
      return (
        designKeywords.some((kw) => title.includes(kw)) ||
        tags.some((t) => designKeywords.some((kw) => t.includes(kw)))
      );
    })
    .map((job: Record<string, unknown>) => ({
      url: String(job.url || `https://remoteOK.com/remote-jobs/${job.slug}`),
      title: String(job.position || ""),
      company: String(job.company || ""),
      salary: job.salary ? String(job.salary) : null,
      location: "Remote",
      description: String(job.description || ""),
      source: "Remote OK",
      posted_at: job.date ? new Date(String(job.date)).toISOString() : null,
    }));
}
