import type { ScrapedJob } from "./remoteok";
import { withPage } from "./browser";

/**
 * Scrapes Indeed for remote design/UX roles using Playwright.
 * Note: Indeed actively blocks headless browsers. This scraper may return 0
 * results when blocked. A proxy/residential IP service would improve reliability.
 */

const SEARCH_QUERIES = [
  "UX designer remote",
  "product designer remote",
  "UI designer remote",
];

export async function scrapeIndeed(): Promise<ScrapedJob[]> {
  const allJobs: ScrapedJob[] = [];
  const seenUrls = new Set<string>();

  for (const query of SEARCH_QUERIES) {
    try {
      const jobs = await withPage(async (page) => {
        const encoded = encodeURIComponent(query);
        await page.goto(
          `https://www.indeed.com/jobs?q=${encoded}&l=remote&fromage=14`,
          { waitUntil: "domcontentloaded", timeout: 20000 }
        );
        await page.waitForTimeout(5000);

        // Check if blocked
        const title = await page.title();
        if (title.toLowerCase().includes("blocked")) return [];

        return page.evaluate(() => {
          const results: { title: string; company: string; location: string; url: string; description: string; posted: string; salary: string }[] = [];

          // Try JSON-LD
          const scripts = document.querySelectorAll('script[type="application/ld+json"]');
          scripts.forEach((script) => {
            try {
              const data = JSON.parse(script.textContent || "");
              const postings = Array.isArray(data) ? data : data.itemListElement || [data];
              for (const p of postings) {
                if (p["@type"] !== "JobPosting") continue;
                results.push({
                  title: p.title || "",
                  company: p.hiringOrganization?.name || "",
                  location: p.jobLocation?.address?.addressLocality || "Remote",
                  url: p.url || "",
                  description: (p.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000),
                  posted: p.datePosted || "",
                  salary: p.baseSalary?.value ? `${p.baseSalary.currency || "USD"} ${p.baseSalary.value.minValue || ""}-${p.baseSalary.value.maxValue || ""}` : "",
                });
              }
            } catch { /* skip */ }
          });

          // Fallback: parse visible cards
          if (results.length === 0) {
            const cards = document.querySelectorAll(".tapItem, .job_seen_beacon, [data-jk]");
            cards.forEach((card) => {
              const titleEl = card.querySelector("h2 a, .jcs-JobTitle, [data-testid='job-title']") as HTMLAnchorElement;
              const companyEl = card.querySelector("[data-testid='company-name'], .companyName") as HTMLElement;
              const jk = card.getAttribute("data-jk") || "";
              const title = titleEl?.textContent?.trim() || "";
              const url = jk ? `https://www.indeed.com/viewjob?jk=${jk}` : titleEl?.href || "";

              if (title && url) {
                results.push({ title, company: companyEl?.textContent?.trim() || "", location: "Remote", url, description: "", posted: "", salary: "" });
              }
            });
          }

          return results;
        });
      });

      for (const job of jobs) {
        if (!job.url || seenUrls.has(job.url)) continue;
        seenUrls.add(job.url);
        allJobs.push({
          url: job.url,
          title: job.title,
          company: job.company,
          salary: job.salary && job.salary !== " -" ? job.salary : null,
          location: job.location,
          description: job.description,
          source: "Indeed",
          posted_at: job.posted ? new Date(job.posted).toISOString() : null,
        });
      }
    } catch {
      // skip failing queries
    }
  }

  return allJobs;
}
