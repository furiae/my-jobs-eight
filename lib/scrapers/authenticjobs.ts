import type { ScrapedJob } from "./types";

const DESIGN_KEYWORDS = [
  "designer",
  "design system",
  "design director",
  "design manager",
  "design lead",
  "product design",
  "ux",
  "ui",
  "figma",
  "creative director",
  "visual design",
  "interaction design",
  "brand design",
];

function isDesignJob(title: string, description: string): boolean {
  const text = `${title} ${description}`.toLowerCase();
  return DESIGN_KEYWORDS.some((kw) => text.includes(kw));
}

function extractField(xml: string, tag: string): string {
  const match = xml.match(
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`)
  );
  if (match) return match[1].trim();
  const simple = xml.match(
    new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`)
  );
  return simple ? simple[1].trim() : "";
}

function extractSalary(description: string): string | null {
  const match = description.match(
    /\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?(?:\s*(?:USD|per year|annually))?/i
  );
  return match ? match[0] : null;
}

export async function scrapeAuthenticJobs(): Promise<ScrapedJob[]> {
  const res = await fetch("https://authenticjobs.com/?feed=job_feed", {
    headers: { "User-Agent": "my-jobs-eight/1.0" },
  });

  if (!res.ok) throw new Error(`AuthenticJobs fetch failed: ${res.status}`);

  const xml = await res.text();
  const items = xml.split("<item>").slice(1);
  const results: ScrapedJob[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const title = extractField(item, "title");
    const link = extractField(item, "link") || extractField(item, "guid");
    const description = extractField(item, "description");
    const company = extractField(item, "job_listing:company");
    const location = extractField(item, "job_listing:location") || "Remote";
    const pubDate = extractField(item, "pubDate");

    if (!link || seen.has(link)) continue;
    if (!isDesignJob(title, description)) continue;

    seen.add(link);
    results.push({
      url: link,
      title,
      company,
      salary: extractSalary(description),
      location,
      description: description.replace(/<[^>]*>/g, "").slice(0, 500),
      source: "Authentic Jobs",
      posted_at: pubDate ? new Date(pubDate).toISOString() : null,
    });
  }

  return results;
}
