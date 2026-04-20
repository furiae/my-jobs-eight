import type { ScrapedJob } from "./types";

const DESIGN_KEYWORDS = ["design", "ux", "ui", "figma", "product designer", "web designer"];

function matchesDesign(title: string): boolean {
  const lower = title.toLowerCase();
  return DESIGN_KEYWORDS.some((kw) => lower.includes(kw));
}

export async function scrapeUIUXJobsBoard(): Promise<ScrapedJob[]> {
  const res = await fetch("https://uiuxjobsboard.com/feed", {
    headers: { "User-Agent": "my-jobs-eight/1.0" },
  });

  if (!res.ok) throw new Error(`UIUXJobsBoard fetch failed: ${res.status}`);

  const xml = await res.text();

  // Parse RSS <item> blocks
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  const jobs: ScrapedJob[] = [];

  for (const item of items) {
    const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
      item.match(/<title>(.*?)<\/title>/))?.[1]?.trim() ?? "";
    const link = (item.match(/<link>(.*?)<\/link>/) ||
      item.match(/<guid[^>]*>(.*?)<\/guid>/))?.[1]?.trim() ?? "";
    const description = (item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
      item.match(/<description>([\s\S]*?)<\/description>/))?.[1]?.trim() ?? "";
    const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() ?? null;
    const company =
      item.match(/<dc:creator><!\[CDATA\[(.*?)\]\]><\/dc:creator>/)?.[1]?.trim() ??
      item.match(/<dc:creator>(.*?)<\/dc:creator>/)?.[1]?.trim() ??
      "";

    if (!title || !link) continue;
    if (!matchesDesign(title) && !matchesDesign(description)) continue;

    jobs.push({
      url: link,
      title,
      company,
      salary: null,
      location: "Remote",
      description: description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      source: "UIUXJobsBoard",
      posted_at: pubDate ? new Date(pubDate).toISOString() : null,
    });
  }

  return jobs;
}
