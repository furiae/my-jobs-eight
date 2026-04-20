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
import { scrapeJobicy } from "@/lib/scrapers/jobicy";
import { scrapeHimalayas } from "@/lib/scrapers/himalayas";
import { scrapeAuthenticJobs } from "@/lib/scrapers/authenticjobs";
import { scrapeWorkingNomads } from "@/lib/scrapers/workingnomads";
import { scrapeRSSFeeds } from "@/lib/scrapers/rss";
import { scrapeReddit } from "@/lib/scrapers/reddit";
import { scrapeDribbble } from "@/lib/scrapers/dribbble";
import { scrapeCoroflot } from "@/lib/scrapers/coroflot";
import { scrapeAIGA } from "@/lib/scrapers/aiga";
import { scrapeKrop } from "@/lib/scrapers/krop";
import { scrapeBehance } from "@/lib/scrapers/behance";
import { scrapeGlassdoor } from "@/lib/scrapers/glassdoor";
import { scrapeWellfound } from "@/lib/scrapers/wellfound";
import { scrapeJustRemote } from "@/lib/scrapers/justremote";
import { scrapePowerToFly } from "@/lib/scrapers/powertofly";
import { scrapeBuiltIn } from "@/lib/scrapers/builtin";
import { scrapeYCombinator } from "@/lib/scrapers/ycombinator";
import { scrapeRemoteIO } from "@/lib/scrapers/remoteio";
import { scrapeNodesk } from "@/lib/scrapers/nodesk";
import { scrapeDesignJobs } from "@/lib/scrapers/designjobs";
import { scrapeToptal } from "@/lib/scrapers/toptal";
import { scrapeGreenhouseBoards } from "@/lib/scrapers/greenhouse-boards";
import { scrapeLeverBoards } from "@/lib/scrapers/lever-boards";
import { upsertJobs } from "@/lib/db";
import { closeBrowser } from "@/lib/scrapers/browser";

export const maxDuration = 120;

export async function GET() {
  try {
    const [remoteok, wwr, remotive, uiux, remotejobs, linkedin, indeed, dice, monster, flexjobs, jobicy, himalayas, authenticjobs, workingnomads, rssFeeds, reddit, dribbble, coroflot, aiga, krop, behance, glassdoor, wellfound, justremote, powertofly, builtin, ycombinator, remoteio, nodesk, designjobs, toptal, greenhouseBoards] = await Promise.allSettled([
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
      scrapeJobicy(),
      scrapeHimalayas(),
      scrapeAuthenticJobs(),
      scrapeWorkingNomads(),
      scrapeRSSFeeds(),
      scrapeReddit(),
      scrapeDribbble(),
      scrapeCoroflot(),
      scrapeAIGA(),
      scrapeKrop(),
      scrapeBehance(),
      scrapeGlassdoor(),
      scrapeWellfound(),
      scrapeJustRemote(),
      scrapePowerToFly(),
      scrapeBuiltIn(),
      scrapeYCombinator(),
      scrapeRemoteIO(),
      scrapeNodesk(),
      scrapeDesignJobs(),
      scrapeToptal(),
      scrapeGreenhouseBoards(),
      scrapeLeverBoards(),
    ]);

    const results = { remoteok, wwr, remotive, uiux, remotejobs, linkedin, indeed, dice, monster, flexjobs, jobicy, himalayas, authenticjobs, workingnomads, rssFeeds, reddit, dribbble, coroflot, aiga, krop, behance, glassdoor, wellfound, justremote, powertofly, builtin, ycombinator, remoteio, nodesk, designjobs, toptal, greenhouseBoards, leverBoards };

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
