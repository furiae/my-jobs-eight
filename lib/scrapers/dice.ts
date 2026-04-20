import type { ScrapedJob } from "./types";
import { withPage } from "./browser";

const SEARCH_QUERIES = [
  "UX designer",
  "product designer",
  "UI designer",
  "Figma designer",
];

export async function scrapeDice(): Promise<ScrapedJob[]> {
  const allJobs: ScrapedJob[] = [];
  const seenUrls = new Set<string>();

  for (const query of SEARCH_QUERIES) {
    try {
      const jobs = await withPage(async (page) => {
        const encoded = encodeURIComponent(query);
        await page.goto(
          `https://www.dice.com/jobs?q=${encoded}&filters.isRemote=true`,
          { waitUntil: "domcontentloaded", timeout: 20000 }
        );
        // Wait for React to render job cards instead of fixed delay
        await page
          .waitForSelector('a[href*="/job-detail/"]', { timeout: 15000 })
          .catch(() => {});
        await page.waitForTimeout(1000); // brief settle after initial render

        return page.evaluate(() => {
          // Dice uses regular anchor tags with /job-detail/ URLs
          // Job titles are the anchors with actual text content linking to /job-detail/
          const allLinks = Array.from(document.querySelectorAll('a[href*="/job-detail/"]'));
          const jobMap = new Map<string, { title: string; url: string }>();

          for (const a of allLinks) {
            const href = (a as HTMLAnchorElement).href.split("?")[0];
            const text = a.textContent?.trim() || "";
            // Skip empty links and "Apply Now" / "Easy Apply" links
            if (!text || text === "Apply Now" || text === "Easy Apply") continue;
            if (!jobMap.has(href)) {
              jobMap.set(href, { title: text, url: href });
            }
          }

          return Array.from(jobMap.values()).map((job) => {
            // Try to find company name near the job link
            return {
              title: job.title,
              company: "", // Hard to extract reliably from Dice's Tailwind layout
              url: job.url,
            };
          });
        });
      });

      for (const job of jobs) {
        if (!job.url || seenUrls.has(job.url)) continue;
        seenUrls.add(job.url);
        allJobs.push({
          url: job.url,
          title: job.title,
          company: job.company,
          salary: null,
          location: "Remote",
          description: "",
          source: "Dice",
          posted_at: null,
        });
      }
    } catch {
      // skip failing queries
    }
  }

  return allJobs;
}
