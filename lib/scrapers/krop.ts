import type { ScrapedJob } from "./remoteok";
import { withPage } from "./browser";

export async function scrapeKrop(): Promise<ScrapedJob[]> {
  return withPage(async (page) => {
    await page.goto(
      "https://www.krop.com/creative-jobs/design/?remote=true",
      { waitUntil: "domcontentloaded", timeout: 20000 }
    );

    await page.waitForSelector("a[href*='/job/'], a[href*='/jobs/']", { timeout: 10000 }).catch(() => {});

    const jobs = await page.evaluate(() => {
      const results: { title: string; company: string; url: string }[] = [];
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

        if (title) {
          results.push({ title, company, url: href.split("?")[0] });
        }
      });

      return results;
    });

    return jobs.map((job) => ({
      url: job.url,
      title: job.title,
      company: job.company,
      salary: null,
      location: "Remote",
      description: "",
      source: "Krop",
      posted_at: null,
    }));
  });
}
