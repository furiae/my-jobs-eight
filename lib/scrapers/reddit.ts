import type { ScrapedJob } from "./types";

const SUBREDDITS = [
  { name: "designjobs", filterHiring: true },
  { name: "forhire", filterHiring: true },
  { name: "remotejobs", filterHiring: false },
];

const HIRING_INDICATORS = [
  "[hiring]",
  "[for hire]",
  "we're hiring",
  "we are hiring",
  "looking for",
  "hiring a",
  "job opening",
  "job opportunity",
  "now hiring",
];

const DESIGN_KEYWORDS = [
  "design",
  "designer",
  "ux",
  "ui",
  "figma",
  "product design",
  "web design",
  "creative director",
  "art director",
  "graphic design",
  "visual design",
  "interaction design",
];

interface RedditEntry {
  title: string;
  link: string;
  content: string;
  author: string;
  published: string | null;
  categories: string[];
}

function extractText(xml: string, tag: string): string {
  const re = new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`
  );
  const match = xml.match(re);
  return match ? (match[1] || match[2] || "").trim() : "";
}

function extractAtomLink(xml: string): string {
  const match = xml.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/);
  return match ? match[1].trim() : "";
}

function extractAllCategories(xml: string): string[] {
  const re = /<category[^>]*term=["']([^"']+)["'][^>]*\/?>/g;
  const results: string[] = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1].toLowerCase());
  }
  return results;
}

function parseAtomEntries(xml: string): RedditEntry[] {
  const entries: RedditEntry[] = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const block = m[1];
    entries.push({
      title: extractText(block, "title"),
      link: extractAtomLink(block),
      content: extractText(block, "content"),
      author: extractText(block, "name"),
      published: extractText(block, "published") || extractText(block, "updated") || null,
      categories: extractAllCategories(block),
    });
  }
  return entries;
}

function isHiringPost(title: string): boolean {
  const lower = title.toLowerCase();
  return HIRING_INDICATORS.some((ind) => lower.includes(ind));
}

function isDesignRelated(title: string, content: string): boolean {
  const text = `${title} ${content}`.toLowerCase();
  return DESIGN_KEYWORDS.some((kw) => text.includes(kw));
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCompensation(text: string): string | null {
  // Look for salary patterns like $50k, $80,000, $50-80k, $100k/yr
  const match = text.match(
    /\$[\d,]+(?:k|K)?(?:\s*[-–—]\s*\$?[\d,]+(?:k|K)?)?(?:\s*\/?\s*(?:yr|year|hr|hour|annually|monthly))?/
  );
  return match ? match[0] : null;
}

async function scrapeSubreddit(
  subreddit: string,
  filterHiring: boolean
): Promise<ScrapedJob[]> {
  const url = `https://www.reddit.com/r/${subreddit}/.rss`;
  const res = await fetch(url, {
    headers: { "User-Agent": "my-jobs-eight/1.0 (job board scraper)" },
  });
  if (!res.ok) return [];

  const xml = await res.text();
  const entries = parseAtomEntries(xml);

  return entries
    .filter((entry) => {
      if (filterHiring && !isHiringPost(entry.title)) return false;
      return isDesignRelated(entry.title, entry.content);
    })
    .map((entry) => {
      const plainContent = stripHtml(entry.content);
      const salary = extractCompensation(plainContent);

      return {
        url: entry.link,
        title: entry.title,
        company: entry.author || `r/${subreddit}`,
        salary,
        location: "Remote",
        description: plainContent.slice(0, 2000),
        source: `Reddit r/${subreddit}`,
        posted_at: entry.published
          ? new Date(entry.published).toISOString()
          : null,
      };
    });
}

export async function scrapeReddit(): Promise<ScrapedJob[]> {
  const seen = new Set<string>();
  const results: ScrapedJob[] = [];

  const settled = await Promise.allSettled(
    SUBREDDITS.map((sub) => scrapeSubreddit(sub.name, sub.filterHiring))
  );

  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const job of result.value) {
      if (!job.url || seen.has(job.url)) continue;
      seen.add(job.url);
      results.push(job);
    }
  }

  return results;
}
