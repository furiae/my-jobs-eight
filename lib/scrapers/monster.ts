import type { ScrapedJob } from "./remoteok";

/**
 * Scrapes Monster's public job search for remote design/UX roles.
 */

const SEARCH_QUERIES = [
  "ux-designer",
  "product-designer",
  "ui-designer",
];

interface MonsterJob {
  jobId?: string;
  title?: string;
  company?: { name?: string };
  jobPosting?: {
    url?: string;
    description?: string;
    datePosted?: string;
  };
  compensation?: { salary?: string };
  location?: { name?: string };
  summary?: string;
}

export async function scrapeMonster(): Promise<ScrapedJob[]> {
  const allJobs: ScrapedJob[] = [];
  const seenUrls = new Set<string>();

  for (const query of SEARCH_QUERIES) {
    try {
      // Monster has a public search results page
      const url = `https://www.monster.com/jobs/search?q=${query}&where=remote&page=1&so=m.h.s`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (!res.ok) continue;

      const html = await res.text();

      // Try JSON-LD structured data first
      const jsonLdBlocks = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g) || [];
      for (const block of jsonLdBlocks) {
        try {
          const jsonStr = block.replace(/<\/?script[^>]*>/g, "").trim();
          const data = JSON.parse(jsonStr);
          const postings = Array.isArray(data) ? data : [data];

          for (const posting of postings) {
            if (posting["@type"] !== "JobPosting") continue;

            const jobUrl = posting.url || "";
            if (!jobUrl || seenUrls.has(jobUrl)) continue;
            seenUrls.add(jobUrl);

            allJobs.push({
              url: jobUrl,
              title: posting.title || "",
              company: posting.hiringOrganization?.name || "",
              salary: posting.baseSalary?.value
                ? `${posting.baseSalary.currency || "USD"} ${posting.baseSalary.value.minValue || ""}-${posting.baseSalary.value.maxValue || ""}`
                : null,
              location: posting.jobLocation?.address?.addressLocality || "Remote",
              description: (posting.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000),
              source: "Monster",
              posted_at: posting.datePosted ? new Date(posting.datePosted).toISOString() : null,
            });
          }
        } catch {
          // skip malformed JSON-LD
        }
      }

      // Fallback: parse job cards from HTML
      if (allJobs.length === 0) {
        const cards = html.match(/<a[^>]*class="[^"]*job-cardstyle[^"]*"[^>]*href="([^"]*)"[\s\S]*?<\/a>/g) || [];
        for (const card of cards) {
          const href = card.match(/href="([^"]*)"/)?.[1] ?? "";
          const title = card.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
          const company = card.match(/<span[^>]*class="[^"]*company[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1]?.trim() ?? "";

          if (!title || !href) continue;
          const jobUrl = href.startsWith("http") ? href : `https://www.monster.com${href}`;
          if (seenUrls.has(jobUrl)) continue;
          seenUrls.add(jobUrl);

          allJobs.push({
            url: jobUrl,
            title,
            company,
            salary: null,
            location: "Remote",
            description: "",
            source: "Monster",
            posted_at: null,
          });
        }
      }
    } catch {
      // skip failing queries
    }
  }

  return allJobs;
}
