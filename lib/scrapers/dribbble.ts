import type { ScrapedJob } from "./remoteok";
import { withPage } from "./browser";

export async function scrapeDribbble(): Promise<ScrapedJob[]> {
  return withPage(async (page) => {
    await page.goto(
      "https://dribbble.com/jobs?location=Anywhere&remote=true",
      { waitUntil: "domcontentloaded", timeout: 20000 }
    );

    await page.waitForSelector("[class*='job']", { timeout: 10000 }).catch(() => {});

    // Scroll to load more
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);
    }

    const jobs = await page.evaluate(() => {
      const results: { title: string; company: string; url: string; location: string }[] = [];

      // Dribbble job cards
      const cards = document.querySelectorAll("a[href*='/jobs/']");
      const seen = new Set<string>();

      cards.forEach((el) => {
        const anchor = el as HTMLAnchorElement;
        const href = anchor.href;
        if (!href || seen.has(href) || !href.includes("/jobs/")) return;

        // Skip navigation links
        if (href.endsWith("/jobs") || href.endsWith("/jobs/")) return;

        seen.add(href);

        const card = anchor.closest("[class*='card'], [class*='job'], li, article") || anchor;
        const allText = card.textContent || "";
        const lines = allText.split("\n").map((l) => l.trim()).filter(Boolean);

        // First meaningful text is usually the title
        const title = lines[0] || anchor.textContent?.trim() || "";
        const company = lines[1] || "";

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
      source: "Dribbble",
      posted_at: null,
    }));
  });
}
