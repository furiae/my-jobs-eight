import type { ScrapedJob } from "./types";
import { withPage } from "./browser";

const DESIGN_KEYWORDS = [
  "designer",
  "ux",
  "ui",
  "figma",
  "design lead",
  "design manager",
  "design director",
  "creative director",
  "product design",
  "visual design",
];

function isDesignJob(title: string): boolean {
  const lower = title.toLowerCase();
  return DESIGN_KEYWORDS.some((kw) => lower.includes(kw));
}

export async function scrapeYCombinator(): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];
  const seen = new Set<string>();

  try {
    const jobs = await withPage(async (page) => {
      await page.goto(
        "https://www.workatastartup.com/jobs/l/designer?remote=true",
        { waitUntil: "networkidle", timeout: 30000 }
      );
      await page.waitForTimeout(3000);

      // Scroll to load more jobs
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(1500);
      }

      return page.evaluate(() => {
        const jobLinks = document.querySelectorAll<HTMLAnchorElement>(
          'a[href^="/jobs/"][data-jobid]'
        );
        const items: {
          title: string;
          company: string;
          url: string;
          salary: string | null;
          location: string;
          posted: string | null;
        }[] = [];
        const seenIds = new Set<string>();

        for (const a of Array.from(jobLinks)) {
          const jobId = a.getAttribute("data-jobid");
          if (!jobId || seenIds.has(jobId)) continue;
          seenIds.add(jobId);

          const title = a.textContent?.trim() || "";
          const url = `https://www.workatastartup.com/jobs/${jobId}`;

          // Find the parent card — the grow div contains both company and job details
          const growDiv = a.closest("div.grow, div[class*='grow']");
          const section = growDiv?.closest("section") || a.closest("section");
          let company = "";
          let salary: string | null = null;
          let location = "Remote";
          let posted: string | null = null;

          // Company name is in a bold span inside a company link in the grow div
          const companyContainer = growDiv || section;
          if (companyContainer) {
            const companyLink = companyContainer.querySelector<HTMLAnchorElement>(
              'a[href*="/companies/"]'
            );
            if (companyLink) {
              const bold = companyLink.querySelector(".font-bold");
              company = bold?.textContent?.trim().replace(/\s*\(.*\)$/, "") || "";
            }

            // Job details text
            const detailsEl = a.closest("div")?.querySelector(".job-details");
            if (detailsEl) {
              const detailText = detailsEl.textContent || "";
              // Extract location
              const parts = detailText.split(/[•·]/);
              if (parts.length > 1) {
                location = parts[1]?.trim() || "Remote";
              }
            }

            // Salary — look for dollar amounts in the container
            const containerText = companyContainer.textContent || "";
            const salaryMatch = containerText.match(
              /\$[\d,]+k?\s*[-–]\s*\$[\d,]+k?/
            );
            if (salaryMatch) {
              salary = salaryMatch[0];
            }

            // Posted date
            const dateSpan = companyContainer.querySelector(
              ".text-gray-300, .text-gray-400"
            );
            if (dateSpan) {
              const dateText = dateSpan.textContent?.trim();
              if (dateText?.includes("ago")) {
                posted = dateText.replace(/[()]/g, "");
              }
            }
          }

          items.push({ title, company, url, salary, location, posted });
        }

        return items;
      });
    });

    for (const job of jobs) {
      if (!isDesignJob(job.title)) continue;
      if (seen.has(job.url)) continue;
      seen.add(job.url);

      results.push({
        url: job.url,
        title: job.title,
        company: job.company,
        salary: job.salary,
        location: job.location,
        description: "",
        source: "Y Combinator",
        posted_at: null,
      });
    }
  } catch {
    // skip
  }

  return results;
}
