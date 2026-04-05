import type { ScrapedJob } from "./remoteok";
import { withPage } from "./browser";

export async function scrapeBehance(): Promise<ScrapedJob[]> {
  return withPage(async (page) => {
    await page.goto(
      "https://www.behance.net/joblist?field=132&remote=true",
      { waitUntil: "domcontentloaded", timeout: 20000 }
    );

    // field=132 is UI/UX Design
    await page.waitForSelector("a[href*='/joblist/']", { timeout: 10000 }).catch(() => {});

    // Scroll to load more
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);
    }

    const jobs = await page.evaluate(() => {
      const results: { title: string; company: string; url: string; location: string }[] = [];
      const seen = new Set<string>();

      // Behance job cards are links to individual job pages
      document.querySelectorAll("a[href*='/joblist/']").forEach((el) => {
        const anchor = el as HTMLAnchorElement;
        const href = anchor.href;
        if (!href || seen.has(href)) return;
        // Skip the main joblist page link
        if (href.endsWith("/joblist") || href.endsWith("/joblist/")) return;
        seen.add(href);

        const card = anchor.closest("li, article, div[class*='Job'], div[class*='card']") || anchor;
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
      source: "Behance",
      posted_at: null,
    }));
  });
}
