import type { ScrapedJob } from "./types";
import { withPage } from "./browser";

export async function scrapeUxcel(): Promise<ScrapedJob[]> {
  return withPage(async (page) => {
    await page.goto("https://app.uxcel.com/jobs", {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });

    await page
      .waitForSelector("a[href*='/jobs/']", { timeout: 10000 })
      .catch(() => {});

    const jobs = await page.evaluate(() => {
      const results: {
        title: string;
        company: string;
        url: string;
        location: string;
        posted: string;
      }[] = [];
      const seen = new Set<string>();

      const links = document.querySelectorAll("a[href*='/jobs/']");
      links.forEach((el) => {
        const anchor = el as HTMLAnchorElement;
        const href = anchor.href;
        if (!href || seen.has(href)) return;
        // Skip the main /jobs page link
        if (href.endsWith("/jobs") || href.endsWith("/jobs/")) return;

        seen.add(href);

        const card = anchor.closest("li, article, div") || anchor;
        const allText = card.textContent || "";
        const lines = allText
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);

        // Extract heading (h3) for title
        const h3 = card.querySelector("h3");
        const title = h3?.textContent?.trim() || lines[0] || "";

        // Company is usually the text before the title
        const company = lines.find(
          (l) => l !== title && !l.includes("ago") && !l.includes("Full-time")
        ) || "";

        // Location from text containing Remote/Anywhere or pipe separator
        const locationLine = lines.find(
          (l) => l.includes("Remote") || l.includes("Anywhere") || l.includes("|")
        );
        const location = locationLine || "Remote";

        // Posted date
        const postedLine = lines.find((l) => l.includes("ago"));
        const posted = postedLine || "";

        if (title) {
          results.push({ title, company, url: href, location, posted });
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
      source: "Uxcel",
      posted_at: null,
    }));
  });
}
