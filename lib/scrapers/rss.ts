import type { ScrapedJob } from "./types";

// --- Generic RSS/Atom parser ---

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
  author: string | null;
  categories: string[];
}

function extractText(xml: string, tag: string): string {
  const re = new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`
  );
  const match = xml.match(re);
  return match ? (match[1] || match[2] || "").trim() : "";
}

function extractAllText(xml: string, tag: string): string[] {
  const re = new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    "g"
  );
  const results: string[] = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    results.push((m[1] || m[2] || "").trim());
  }
  return results;
}

function extractAtomLink(xml: string): string {
  // Atom uses <link href="..." />
  const match = xml.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/);
  return match ? match[1].trim() : "";
}

function parseRSSItems(xml: string): RSSItem[] {
  // RSS 2.0 uses <item>, Atom uses <entry>
  const isAtom = xml.includes("<feed") && xml.includes("<entry");
  const itemTag = isAtom ? "entry" : "item";
  const itemRe = new RegExp(`<${itemTag}[^>]*>([\\s\\S]*?)<\\/${itemTag}>`, "g");

  const items: RSSItem[] = [];
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const link = extractText(block, "link") || extractAtomLink(block);
    const title = extractText(block, "title");
    const description =
      extractText(block, "description") ||
      extractText(block, "content") ||
      extractText(block, "summary") ||
      "";
    const pubDate =
      extractText(block, "pubDate") ||
      extractText(block, "published") ||
      extractText(block, "updated") ||
      null;
    const author =
      extractText(block, "author") ||
      extractText(block, "dc:creator") ||
      null;
    const categories = extractAllText(block, "category");

    items.push({ title, link, description, pubDate, author, categories });
  }
  return items;
}

// --- Feed configuration ---

export interface RSSFeedConfig {
  url: string;
  source: string;
  /** Extract company name from the item. Defaults to source name. */
  parseCompany?: (item: RSSItem) => string;
  /** Extract salary from the item. Defaults to null. */
  parseSalary?: (item: RSSItem) => string | null;
  /** Filter items to design jobs only. If omitted, all items pass. */
  filter?: (item: RSSItem) => boolean;
}

const DESIGN_KEYWORDS = [
  "design",
  "designer",
  "ux",
  "ui",
  "figma",
  "product design",
  "web design",
  "creative director",
  "design lead",
  "design manager",
  "design director",
];

function isDesignJob(item: RSSItem): boolean {
  const text = `${item.title} ${item.categories.join(" ")}`.toLowerCase();
  return DESIGN_KEYWORDS.some((kw) => text.includes(kw));
}

/** Default: extract "Company: Title" format used by WWR and others */
function parseCompanyFromTitle(title: string): { company: string; jobTitle: string } {
  const idx = title.indexOf(": ");
  if (idx > 0) return { company: title.slice(0, idx), jobTitle: title.slice(idx + 2) };
  return { company: "", jobTitle: title };
}

// --- Pre-configured feeds ---

export const RSS_FEEDS: RSSFeedConfig[] = [
  {
    url: "https://weworkremotely.com/categories/remote-design-jobs.rss",
    source: "We Work Remotely (RSS)",
    parseCompany: (item) => parseCompanyFromTitle(item.title).company,
    filter: () => true, // already filtered by category URL
  },
  {
    url: "https://weworkremotely.com/categories/remote-product-jobs.rss",
    source: "We Work Remotely (RSS)",
    parseCompany: (item) => parseCompanyFromTitle(item.title).company,
    filter: isDesignJob,
  },
  {
    url: "https://remotive.com/remote-jobs/design/feed",
    source: "Remotive (RSS)",
    filter: () => true,
  },
  {
    url: "https://jobicy.com/feed/newjobs",
    source: "Jobicy (RSS)",
    filter: isDesignJob,
  },
];

// --- Scraper entry point ---

async function fetchFeed(config: RSSFeedConfig): Promise<ScrapedJob[]> {
  const res = await fetch(config.url, {
    headers: { "User-Agent": "my-jobs-eight/1.0" },
  });
  if (!res.ok) return [];

  const xml = await res.text();
  const items = parseRSSItems(xml);

  return items
    .filter(config.filter ?? (() => true))
    .map((item) => {
      const { company: titleCompany, jobTitle } = parseCompanyFromTitle(item.title);
      const company = config.parseCompany
        ? config.parseCompany(item)
        : titleCompany || item.author || config.source;

      return {
        url: item.link,
        title: config.parseCompany ? jobTitle : item.title,
        company,
        salary: config.parseSalary ? config.parseSalary(item) : null,
        location: "Remote",
        description: item.description,
        source: config.source,
        posted_at: item.pubDate
          ? new Date(item.pubDate).toISOString()
          : null,
      };
    });
}

export async function scrapeRSSFeeds(
  feeds: RSSFeedConfig[] = RSS_FEEDS
): Promise<ScrapedJob[]> {
  const seen = new Set<string>();
  const results: ScrapedJob[] = [];

  const settled = await Promise.allSettled(feeds.map(fetchFeed));

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
