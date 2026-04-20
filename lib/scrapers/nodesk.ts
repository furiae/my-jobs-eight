import type { ScrapedJob } from "./types";

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

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export async function scrapeNodesk(): Promise<ScrapedJob[]> {
  const results: ScrapedJob[] = [];
  const seen = new Set<string>();

  try {
    const res = await fetch("https://nodesk.co/remote-jobs/design/", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) return results;

    const html = await res.text();

    // Extract from JSON-LD structured data
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
              ? (data.itemListElement ?? []).map(
                  (e: { item?: unknown }) => e.item ?? e
                )
              : data["@type"] === "JobPosting"
                ? [data]
                : [];

          for (const posting of postings) {
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
              description: stripHtml(posting.description ?? "").slice(0, 500),
              source: "Nodesk",
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
    // skip
  }

  return results;
}
