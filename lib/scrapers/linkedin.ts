import type { ScrapedJob } from "./types";
import { withPage } from "./browser";

const SEARCH_QUERIES = [
  "remote UX designer",
  "remote product designer",
  "remote UI designer",
  "remote figma designer",
];

export async function scrapeLinkedIn(): Promise<ScrapedJob[]> {
  const allJobs: ScrapedJob[] = [];
  const seenUrls = new Set<string>();

  for (const query of SEARCH_QUERIES) {
    try {
      const jobs = await withPage(async (page) => {
        const encoded = encodeURIComponent(query);
        await page.goto(
          `https://www.linkedin.com/jobs/search?keywords=${encoded}&f_WT=2&position=1&pageNum=0`,
          { waitUntil: "domcontentloaded", timeout: 20000 }
        );

        // Wait for job cards to render
        await page.waitForSelector(".base-card", { timeout: 10000 }).catch(() => {});

        // Scroll to load more cards
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(1000);
        }

        return page.evaluate(() => {
          const cards = document.querySelectorAll(".base-card");
          const results: { title: string; company: string; location: string; url: string; posted: string }[] = [];

          cards.forEach((card) => {
            const titleEl = card.querySelector(".base-search-card__title") as HTMLElement;
            const companyEl = card.querySelector(".base-search-card__subtitle a") as HTMLElement;
            const locationEl = card.querySelector(".job-search-card__location") as HTMLElement;
            const linkEl = card.querySelector("a.base-card__full-link") as HTMLAnchorElement;
            const timeEl = card.querySelector("time") as HTMLTimeElement;

            const title = titleEl?.textContent?.trim() || "";
            const url = linkEl?.href?.split("?")[0] || "";

            if (title && url) {
              results.push({
                title,
                company: companyEl?.textContent?.trim() || "",
                location: locationEl?.textContent?.trim() || "Remote",
                url,
                posted: timeEl?.getAttribute("datetime") || "",
              });
            }
          });
          return results;
        });
      });

      for (const job of jobs) {
        if (seenUrls.has(job.url)) continue;
        seenUrls.add(job.url);
        allJobs.push({
          url: job.url,
          title: job.title,
          company: job.company,
          salary: null,
          location: job.location,
          description: "",
          source: "LinkedIn",
          posted_at: job.posted ? new Date(job.posted).toISOString() : null,
        });
      }
    } catch {
      // skip failing queries
    }
  }

  return allJobs;
}
