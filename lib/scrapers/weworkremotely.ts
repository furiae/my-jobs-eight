import type { ScrapedJob } from "./types";

const DESIGN_CATEGORIES = [
  "https://weworkremotely.com/categories/remote-design-jobs.rss",
  "https://weworkremotely.com/categories/remote-product-jobs.rss",
];

function extractText(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? (match[1] || match[2] || "").trim() : "";
}

function parseItems(xml: string): ScrapedJob[] {
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  return items.map((item) => {
    const title = extractText(item, "title");
    const link = extractText(item, "link") || "";
    const description = extractText(item, "description");
    const pubDate = extractText(item, "pubDate");

    // Title format: "Company: Job Title"
    const colonIdx = title.indexOf(": ");
    const company = colonIdx > 0 ? title.slice(0, colonIdx) : "";
    const jobTitle = colonIdx > 0 ? title.slice(colonIdx + 2) : title;

    return {
      url: link,
      title: jobTitle,
      company,
      salary: null,
      location: "Remote",
      description,
      source: "We Work Remotely",
      posted_at: pubDate ? new Date(pubDate).toISOString() : null,
    };
  });
}

export async function scrapeWeWorkRemotely(): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];

  for (const url of DESIGN_CATEGORIES) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const xml = await res.text();
      results.push(...parseItems(xml));
    } catch {
      // skip failing feeds
    }
  }

  return results;
}
