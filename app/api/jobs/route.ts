import { NextRequest, NextResponse } from "next/server";
import { getJobs, type SortField, type SortDir } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || 50), 200);
  const offset = Number(searchParams.get("offset") || 0);
  const source = searchParams.get("source") || undefined;
  const sortField = (searchParams.get("sortField") || "scraped_at") as SortField;
  const sortDir = (searchParams.get("sortDir") || "desc") as SortDir;

  try {
    const { jobs, total } = await getJobs(limit, offset, source, sortField, sortDir);
    return NextResponse.json({ jobs, total, limit, offset });
  } catch (err) {
    console.error("Jobs fetch error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
