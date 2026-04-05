import type { ScrapedJob } from "./remoteok";
import { withPage } from "./browser";

const SEARCH_QUERIES = [
  "ux designer",
  "product designer",
  "ui designer",
];

export async function scrapeMonster(): Promise<ScrapedJob[]> {
  const allJobs: ScrapedJob[] = [];
  const seenUrls = new Set<string>();

  for (const query of SEARCH_QUERIES) {
    try {
      const jobs = await withPage(async (page) => {
        const encoded = encodeURIComponent(query);
        await page.goto(
          `https://www.monster.com/jobs/search?q=${encoded}&where=remote&page=1&so=m.h.s`,
          { waitUntil: "domcontentloaded", timeout: 20000 }
        );

        await page.waitForSelector("[data-testid='svx-job-card'], .job-cardstyle, [data-testid='jobTitle']", { timeout: 10000 }).catch(() => {});

        return page.evaluate(() => {
          const results: { title: string; company: string; location: string; url: string; description: string; posted: string; salary: string }[] = [];

          // Try JSON-LD
          const scripts = document.querySelectorAll('script[type="application/ld+json"]');
          scripts.forEach((script) => {
            try {
              const data = JSON.parse(script.textContent || "");
              const postings = Array.isArray(data) ? data : [data];
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

          // Fallback: visible cards
          if (results.length === 0) {
            const cards = document.querySelectorAll("[data-testid='svx-job-card'], article, .job-cardstyle__container");
            cards.forEach((card) => {
              const titleEl = card.querySelector("[data-testid='jobTitle'] a, h2 a, a[href*='/job/']") as HTMLAnchorElement;
              const companyEl = card.querySelector("[data-testid='company'], .company") as HTMLElement;
              const locationEl = card.querySelector("[data-testid='jobLocation'], .location") as HTMLElement;

              const title = titleEl?.textContent?.trim() || "";
              const url = titleEl?.href || "";

              if (title && url) {
                results.push({
                  title,
                  company: companyEl?.textContent?.trim() || "",
                  location: locationEl?.textContent?.trim() || "Remote",
                  url,
                  description: "",
                  posted: "",
                  salary: "",
                });
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
          source: "Monster",
          posted_at: job.posted ? new Date(job.posted).toISOString() : null,
        });
      }
    } catch {
      // skip failing queries
    }
  }

  return allJobs;
}
