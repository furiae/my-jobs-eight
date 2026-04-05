import type { ScrapedJob } from "./remoteok";
import { withPage } from "./browser";

export async function scrapeCoroflot(): Promise<ScrapedJob[]> {
  return withPage(async (page) => {
    await page.goto(
      "https://www.coroflot.com/design-jobs?location=remote",
      { waitUntil: "domcontentloaded", timeout: 20000 }
    );

    await page.waitForSelector("a[href*='/design-jobs/']", { timeout: 10000 }).catch(() => {});

    const jobs = await page.evaluate(() => {
      const results: { title: string; company: string; url: string; location: string }[] = [];
      const seen = new Set<string>();

      document.querySelectorAll("a[href*='/design-jobs/']").forEach((el) => {
        const anchor = el as HTMLAnchorElement;
        const href = anchor.href;
        if (!href || seen.has(href)) return;
        seen.add(href);

        const card = anchor.closest("li, article, div[class*='job'], tr") || anchor;
        const title = anchor.textContent?.trim() || "";

        // Look for company name in sibling or parent elements
        const allText = card.textContent || "";
        const lines = allText.split("\n").map((l) => l.trim()).filter(Boolean);
        const company = lines.find((l) => l !== title) || "";

        if (title) {
          results.push({
            title,
            company,
            url: href.split("?")[0],
            location: "Remote",
          });
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
      source: "Coroflot",
      posted_at: null,
    }));
  });
}
