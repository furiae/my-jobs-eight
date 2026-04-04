import { NextResponse } from "next/server";
import { scrapeRemoteOK } from "@/lib/scrapers/remoteok";
import { scrapeWeWorkRemotely } from "@/lib/scrapers/weworkremotely";
import { scrapeRemotive } from "@/lib/scrapers/remotive";
import { scrapeUIUXJobsBoard } from "@/lib/scrapers/uiuxjobsboard";
import { scrapeRemoteJobs } from "@/lib/scrapers/remotejobs";
import { upsertJobs } from "@/lib/db";

export const maxDuration = 60;

export async function GET() {
  try {
    const [remoteok, wwr, remotive, uiux, remotejobs] = await Promise.allSettled([
      scrapeRemoteOK(),
      scrapeWeWorkRemotely(),
      scrapeRemotive(),
      scrapeUIUXJobsBoard(),
      scrapeRemoteJobs(),
    ]);

    const allJobs = [
      ...(remoteok.status === "fulfilled" ? remoteok.value : []),
      ...(wwr.status === "fulfilled" ? wwr.value : []),
      ...(remotive.status === "fulfilled" ? remotive.value : []),
      ...(uiux.status === "fulfilled" ? uiux.value : []),
      ...(remotejobs.status === "fulfilled" ? remotejobs.value : []),
    ];

    const inserted = await upsertJobs(allJobs);

    return NextResponse.json({
      ok: true,
      scraped: allJobs.length,
      inserted,
      sources: {
        remoteok: remoteok.status === "fulfilled" ? remoteok.value.length : 0,
        wwr: wwr.status === "fulfilled" ? wwr.value.length : 0,
        remotive: remotive.status === "fulfilled" ? remotive.value.length : 0,
        uiuxjobsboard: uiux.status === "fulfilled" ? uiux.value.length : 0,
        remotejobs: remotejobs.status === "fulfilled" ? remotejobs.value.length : 0,
      },
    });
  } catch (err) {
    console.error("Scrape error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
