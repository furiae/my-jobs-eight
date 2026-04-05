import type { ScrapedJob } from "./remoteok";

/**
 * Scrapes Indeed's public job search results for remote design/UX roles.
 * Uses Indeed's public search page — no API key required.
 */

const SEARCH_QUERIES = [
  "UX+designer+remote",
  "product+designer+remote",
  "UI+designer+remote",
];

function extractJobsFromHTML(html: string): ScrapedJob[] {
  const jobs: ScrapedJob[] = [];

  // Indeed wraps each job card in a div with data-jk (job key) attribute
  const cards = html.match(/<div[^>]*class="[^"]*job_seen_beacon[^"]*"[^>]*>[\s\S]*?<\/td>/g) ||
    html.match(/<a[^>]*id="job_([a-f0-9]+)"[\s\S]*?<\/a>/g) || [];

  // Fallback: extract from structured data (JSON-LD) if available
  const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g);
  if (jsonLdMatch) {
    for (const block of jsonLdMatch) {
      try {
        const jsonStr = block.replace(/<\/?script[^>]*>/g, "").trim();
        const data = JSON.parse(jsonStr);
        const postings = Array.isArray(data) ? data : data.itemListElement || [data];

        for (const posting of postings) {
          if (posting["@type"] !== "JobPosting") continue;

          const title = posting.title || "";
          const company = posting.hiringOrganization?.name || "";
          const location = posting.jobLocation?.address?.addressLocality || "Remote";
          const url = posting.url || "";
          const description = posting.description?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "";
          const posted = posting.datePosted || null;
          const salary = posting.baseSalary?.value
            ? `${posting.baseSalary.currency || "USD"} ${posting.baseSalary.value.minValue || ""}-${posting.baseSalary.value.maxValue || ""}`
            : null;

          if (!title || !url) continue;

          jobs.push({
            url,
            title,
            company,
            salary: salary && salary !== " -" ? salary : null,
            location,
            description: description.slice(0, 2000),
            source: "Indeed",
            posted_at: posted ? new Date(posted).toISOString() : null,
          });
        }
      } catch {
        // skip malformed JSON-LD
      }
    }
  }

  // If no JSON-LD results, try HTML parsing
  if (jobs.length === 0) {
    const titleLinks = html.match(/<a[^>]*class="[^"]*jcs-JobTitle[^"]*"[^>]*>[\s\S]*?<\/a>/g) || [];
    for (const link of titleLinks) {
      const href = link.match(/href="([^"]*)"/)?.[1] ?? "";
      const jk = link.match(/data-jk="([^"]*)"/)?.[1] ?? "";
      const title = link.match(/<span[^>]*>([\s\S]*?)<\/span>/)?.[1]?.trim() ?? "";

      if (!title) continue;

      const jobUrl = jk ? `https://www.indeed.com/viewjob?jk=${jk}` : (href.startsWith("http") ? href : `https://www.indeed.com${href}`);

      jobs.push({
        url: jobUrl,
        title,
        company: "",
        salary: null,
        location: "Remote",
        description: "",
        source: "Indeed",
        posted_at: null,
      });
    }
  }

  return jobs;
}

export async function scrapeIndeed(): Promise<ScrapedJob[]> {
  const allJobs: ScrapedJob[] = [];
  const seenUrls = new Set<string>();

  for (const query of SEARCH_QUERIES) {
    try {
      const url = `https://www.indeed.com/jobs?q=${query}&l=&sc=0kf%3Aattr(DSQF7)%3B&fromage=14`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (!res.ok) continue;

      const html = await res.text();
      const jobs = extractJobsFromHTML(html);

      for (const job of jobs) {
        if (seenUrls.has(job.url)) continue;
        seenUrls.add(job.url);
        allJobs.push(job);
      }
    } catch {
      // skip failing queries
    }
  }

  return allJobs;
}
