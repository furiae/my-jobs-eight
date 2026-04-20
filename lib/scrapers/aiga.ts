import type { ScrapedJob } from "./types";
import { withPage } from "./browser";

export async function scrapeAIGA(): Promise<ScrapedJob[]> {
  return withPage(async (page) => {
    await page.goto(
      "https://designjobs.aiga.org/#checks=remote",
      { waitUntil: "domcontentloaded", timeout: 20000 }
    );

    // Wait for job listings to load
    await page.waitForSelector("a[href*='/job/'], a[href*='/jobs/']", { timeout: 10000 }).catch(() => {});

    // Scroll to load more
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);
    }

    const jobs = await page.evaluate(() => {
      const results: { title: string; company: string; url: string; location: string }[] = [];
      const seen = new Set<string>();

      document.querySelectorAll("a[href*='/job/'], a[href*='/jobs/']").forEach((el) => {
        const anchor = el as HTMLAnchorElement;
        const href = anchor.href;
        if (!href || seen.has(href)) return;
        seen.add(href);

        const card = anchor.closest("li, article, div[class*='job'], div[class*='listing']") || anchor;
        const allText = card.textContent || "";
        const lines = allText.split("\n").map((l) => l.trim()).filter(Boolean);

        const title = lines[0] || anchor.textContent?.trim() || "";
        const company = lines[1] || "";
        const location = lines.find((l) => /remote|anywhere/i.test(l)) || "Remote";

        if (title) {
          results.push({ title, company, url: href.split("?")[0], location });
        }
      });

      return results;
    });

    return jobs.map((job) => ({
      url: job.url,
      title: job.title,
      company: job.company,
      salary: null,
      location: job.location,
      description: "",
      source: "AIGA Design Jobs",
      posted_at: null,
    }));
  });
}
