import type { ScrapedJob } from "./types";

const DESIGN_KEYWORDS = [
  "designer",
  "ux",
  "ui",
  "figma",
  "design lead",
  "design manager",
  "product design",
  "creative director",
  "visual design",
];

function isDesignJob(title: string): boolean {
  const lower = title.toLowerCase();
  return DESIGN_KEYWORDS.some((kw) => lower.includes(kw));
}

interface WellfoundJob {
  id: string;
  title: string;
  slug: string;
  description: string;
  remote: boolean;
  compensation?: string;
  company: { name: string; slug: string };
  locations: string[];
  postedAt: string;
}

export async function scrapeWellfound(): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];
  const seen = new Set<string>();

  for (const role of ["designer", "ux-designer", "ui-designer"]) {
    try {
      const res = await fetch(
        `https://wellfound.com/role/r/${role}?remote=true`,
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

      // Extract from JSON-LD or Apollo state embedded in page
      const ldJsonMatches = html.match(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
      );

      if (ldJsonMatches) {
        for (const match of ldJsonMatches) {
          try {
            const jsonStr = match
              .replace(/<script type="application\/ld\+json">/, "")
              .replace(/<\/script>/, "");
            const data = JSON.parse(jsonStr);

            const postings =
              data["@type"] === "ItemList"
                ? data.itemListElement ?? []
                : data["@type"] === "JobPosting"
                  ? [data]
                  : [];

            for (const item of postings) {
              const posting = item.item ?? item;
              if (posting["@type"] !== "JobPosting") continue;
              if (!isDesignJob(posting.title ?? "")) continue;

              const url = posting.url ?? "";
              if (!url || seen.has(url)) continue;
              seen.add(url);

              let salary: string | null = null;
              if (posting.baseSalary?.value) {
                const v = posting.baseSalary.value;
                const cur = posting.baseSalary.currency ?? "USD";
                if (v.minValue && v.maxValue)
                  salary = `${cur} ${v.minValue}-${v.maxValue}`;
              }

              results.push({
                url,
                title: posting.title,
                company: posting.hiringOrganization?.name ?? "",
                salary,
                location:
                  posting.jobLocation?.address?.addressLocality ?? "Remote",
                description: (posting.description ?? "")
                  .replace(/<[^>]*>/g, " ")
                  .replace(/\s+/g, " ")
                  .trim()
                  .slice(0, 500),
                source: "Wellfound",
                posted_at: posting.datePosted
                  ? new Date(posting.datePosted).toISOString()
                  : null,
              });
            }
          } catch {
            // skip
          }
        }
      }
    } catch {
      // skip failing requests
    }
  }

  return results;
}
