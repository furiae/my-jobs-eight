import type { ScrapedJob } from "./remoteok";
import { withPage } from "./browser";

const CATEGORY_URLS = [
  "https://www.flexjobs.com/remote-jobs/graphic-design",
  "https://www.flexjobs.com/remote-jobs/web-design",
  "https://www.flexjobs.com/remote-jobs/internet-ecommerce?search=ux+designer",
];

export async function scrapeFlexJobs(): Promise<ScrapedJob[]> {
  const allJobs: ScrapedJob[] = [];
  const seenUrls = new Set<string>();

  for (const categoryUrl of CATEGORY_URLS) {
    try {
      const jobs = await withPage(async (page) => {
        await page.goto(categoryUrl, { waitUntil: "domcontentloaded", timeout: 20000 });

        // Wait for job listings
        await page.waitForSelector(".job-title, .sc-job-title, [data-testid='job-title']", { timeout: 10000 }).catch(() => {});

        return page.evaluate(() => {
          const results: { title: string; company: string; location: string; url: string; description: string; posted: string }[] = [];

          // Try JSON-LD
          const scripts = document.querySelectorAll('script[type="application/ld+json"]');
          scripts.forEach((script) => {
            try {
              const data = JSON.parse(script.textContent || "");
              const items = data.itemListElement || (Array.isArray(data) ? data : []);
              for (const item of items) {
                const p = item.item || item;
                if (p["@type"] !== "JobPosting") continue;
                results.push({
                  title: p.title || "",
                  company: p.hiringOrganization?.name || "",
                  location: p.jobLocation?.address?.addressLocality || "Remote",
                  url: p.url || "",
                  description: (p.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000),
                  posted: p.datePosted || "",
                });
              }
            } catch { /* skip */ }
          });

          // Fallback: visible job cards
          if (results.length === 0) {
            const links = document.querySelectorAll("a.job-title, a.sc-job-title, [data-testid='job-title'] a, li.job a[href*='/job/']");
            links.forEach((el) => {
              const a = el as HTMLAnchorElement;
              const title = a.textContent?.trim() || "";
              const href = a.href || "";

              if (title && href) {
                const url = href.startsWith("http") ? href : `https://www.flexjobs.com${href}`;
                const parentCard = a.closest("li, article, .job-card, [class*='job']");
                const company = parentCard?.querySelector(".company, .sc-company-name, [data-testid='company-name']")?.textContent?.trim() || "";

                results.push({
                  title,
                  company,
                  location: "Remote",
                  url,
                  description: "",
                  posted: "",
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
          salary: null,
          location: job.location,
          description: job.description,
          source: "FlexJobs",
          posted_at: job.posted ? new Date(job.posted).toISOString() : null,
        });
      }
    } catch {
      // skip failing categories
    }
  }

  return allJobs;
}
