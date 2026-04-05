import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

// GET /api/stats — pipeline metrics for the last N days (default 7)
export async function GET(req: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }

  const url = new URL(req.url);
  const days = Math.min(Number(url.searchParams.get("days") ?? "7"), 90);
  const sql = neon(process.env.DATABASE_URL);

  const [dailyJobs, dailyApplications, totals] = await Promise.all([
    // Jobs scraped per day
    sql`
      SELECT
        date_trunc('day', scraped_at)::date AS day,
        count(*)::int AS scraped
      FROM jobs
      WHERE scraped_at >= now() - make_interval(days => ${days})
      GROUP BY 1 ORDER BY 1 DESC
    `,
    // Applications per day by status
    sql`
      SELECT
        date_trunc('day', created_at)::date AS day,
        count(*)::int AS attempted,
        count(*) FILTER (WHERE status = 'applied')::int AS applied,
        count(*) FILTER (WHERE status = 'failed')::int AS failed,
        count(*) FILTER (WHERE status = 'manual_required')::int AS manual
      FROM applications
      WHERE created_at >= now() - make_interval(days => ${days})
      GROUP BY 1 ORDER BY 1 DESC
    `,
    // All-time totals
    sql`
      SELECT
        (SELECT count(*)::int FROM jobs) AS total_jobs,
        (SELECT count(*)::int FROM applications) AS total_attempts,
        (SELECT count(*)::int FROM applications WHERE status = 'applied') AS total_applied,
        (SELECT count(*)::int FROM applications WHERE status = 'failed') AS total_failed,
        (SELECT count(*)::int FROM applications WHERE status = 'manual_required') AS total_manual
    `,
  ]);

  return NextResponse.json({
    days,
    totals: totals[0],
    dailyJobs,
    dailyApplications,
  });
}
