import type { ScrapedJob } from "./remoteok";

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

interface GlassdoorListing {
  jobId: string;
  jobTitle: string;
  employer: { name: string };
  location: string;
  listingAge: string;
  jobLink: string;
  descriptionFragment?: string;
  salary?: { min?: number; max?: number; currency?: string };
}

export async function scrapeGlassdoor(): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];
  const seen = new Set<string>();

  for (const keyword of ["ux+designer", "ui+designer", "product+designer"]) {
    try {
      const res = await fetch(
        `https://www.glassdoor.com/Job/remote-${keyword}-jobs-SRCH_IL.0,6_IS11047_KO7,${7 + keyword.replace(/\+/g, " ").length}.htm`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml",
          },
        }
      );

      if (!res.ok) continue;

      const html = await res.text();

      // Extract job listings from structured data
      const ldJsonMatches = html.match(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
      );

      if (!ldJsonMatches) continue;

      for (const match of ldJsonMatches) {
        try {
          const jsonStr = match
            .replace(/<script type="application\/ld\+json">/, "")
            .replace(/<\/script>/, "");
          const data = JSON.parse(jsonStr);

          if (data["@type"] === "JobPosting" && isDesignJob(data.title ?? "")) {
            const url = data.url ?? "";
            if (!url || seen.has(url)) continue;
            seen.add(url);

            let salary: string | null = null;
            if (data.baseSalary?.value) {
              const v = data.baseSalary.value;
              const cur = data.baseSalary.currency ?? "USD";
              if (v.minValue && v.maxValue)
                salary = `${cur} ${v.minValue}-${v.maxValue}`;
              else if (v.value) salary = `${cur} ${v.value}`;
            }

            results.push({
              url,
              title: data.title,
              company: data.hiringOrganization?.name ?? "",
              salary,
              location: data.jobLocation?.address?.addressLocality ?? "Remote",
              description: (data.description ?? "")
                .replace(/<[^>]*>/g, " ")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 500),
              source: "Glassdoor",
              posted_at: data.datePosted
                ? new Date(data.datePosted).toISOString()
                : null,
            });
          }
        } catch {
          // skip malformed JSON-LD
        }
      }
    } catch {
      // skip failing requests
    }
  }

  return results;
}
