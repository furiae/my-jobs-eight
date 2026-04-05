import { NextResponse } from "next/server";
import { scrapeRemoteOK } from "@/lib/scrapers/remoteok";
import { scrapeWeWorkRemotely } from "@/lib/scrapers/weworkremotely";
import { scrapeRemotive } from "@/lib/scrapers/remotive";
import { scrapeUIUXJobsBoard } from "@/lib/scrapers/uiuxjobsboard";
import { scrapeRemoteJobs } from "@/lib/scrapers/remotejobs";
import { scrapeLinkedIn } from "@/lib/scrapers/linkedin";
import { scrapeIndeed } from "@/lib/scrapers/indeed";
import { scrapeDice } from "@/lib/scrapers/dice";
import { scrapeMonster } from "@/lib/scrapers/monster";
import { scrapeFlexJobs } from "@/lib/scrapers/flexjobs";
import { upsertJobs } from "@/lib/db";
import { closeBrowser } from "@/lib/scrapers/browser";

export const maxDuration = 120;

export async function GET() {
  try {
    const [remoteok, wwr, remotive, uiux, remotejobs, linkedin, indeed, dice, monster, flexjobs] = await Promise.allSettled([
      scrapeRemoteOK(),
      scrapeWeWorkRemotely(),
      scrapeRemotive(),
      scrapeUIUXJobsBoard(),
      scrapeRemoteJobs(),
      scrapeLinkedIn(),
      scrapeIndeed(),
      scrapeDice(),
      scrapeMonster(),
      scrapeFlexJobs(),
    ]);

    const results = { remoteok, wwr, remotive, uiux, remotejobs, linkedin, indeed, dice, monster, flexjobs };

    const allJobs = Object.values(results).flatMap(
      (r) => (r.status === "fulfilled" ? r.value : [])
    );

    const inserted = await upsertJobs(allJobs);

    const sources = Object.fromEntries(
      Object.entries(results).map(([key, r]) => [
        key,
        r.status === "fulfilled" ? r.value.length : 0,
      ])
    );

    await closeBrowser();

    return NextResponse.json({
      ok: true,
      scraped: allJobs.length,
      inserted,
      sources,
    });
  } catch (err) {
    await closeBrowser().catch(() => {});
    console.error("Scrape error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
