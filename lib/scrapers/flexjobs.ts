import type { ScrapedJob } from "./remoteok";

/**
 * Scrapes FlexJobs' public job listings for remote design/UX roles.
 * Note: FlexJobs requires a paid membership for full details, but
 * public listings are still visible with title/company/location.
 */

const CATEGORY_URLS = [
  "https://www.flexjobs.com/remote-jobs/graphic-design",
  "https://www.flexjobs.com/remote-jobs/web-design",
  "https://www.flexjobs.com/remote-jobs/internet-ecommerce?search=ux+designer",
];

export async function scrapeFlexJobs(): Promise<ScrapedJob[]> {
  const allJobs: ScrapedJob[] = [];
  const seenUrls = new Set<string>();

  for (const categoryUrl of CATEGORY_URLS) {
    try {
      const res = await fetch(categoryUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (!res.ok) continue;

      const html = await res.text();

      // FlexJobs uses structured job cards
      const cards = html.match(/<a[^>]*class="[^"]*job-title[^"]*"[^>]*>[\s\S]*?<\/a>/g) ||
        html.match(/<li[^>]*class="[^"]*job[^"]*"[^>]*>[\s\S]*?<\/li>/g) || [];

      for (const card of cards) {
        const href = card.match(/href="([^"]*)"/)?.[1] ?? "";
        const title = card.match(/>([\s\S]*?)<\/a>/)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";

        if (!title || !href) continue;
        const jobUrl = href.startsWith("http") ? href : `https://www.flexjobs.com${href}`;
        if (seenUrls.has(jobUrl)) continue;
        seenUrls.add(jobUrl);

        allJobs.push({
          url: jobUrl,
          title,
          company: "",
          salary: null,
          location: "Remote",
          description: "",
          source: "FlexJobs",
          posted_at: null,
        });
      }

      // Also try JSON-LD
      const jsonLdBlocks = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g) || [];
      for (const block of jsonLdBlocks) {
        try {
          const jsonStr = block.replace(/<\/?script[^>]*>/g, "").trim();
          const data = JSON.parse(jsonStr);
          const items = data.itemListElement || (Array.isArray(data) ? data : []);

          for (const item of items) {
            const posting = item.item || item;
            if (posting["@type"] !== "JobPosting") continue;

            const jobUrl = posting.url || "";
            if (!jobUrl || seenUrls.has(jobUrl)) continue;
            seenUrls.add(jobUrl);

            allJobs.push({
              url: jobUrl,
              title: posting.title || "",
              company: posting.hiringOrganization?.name || "",
              salary: null,
              location: posting.jobLocation?.address?.addressLocality || "Remote",
              description: (posting.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000),
              source: "FlexJobs",
              posted_at: posting.datePosted ? new Date(posting.datePosted).toISOString() : null,
            });
          }
        } catch {
          // skip malformed JSON-LD
        }
      }
    } catch {
      // skip failing categories
    }
  }

  return allJobs;
}
