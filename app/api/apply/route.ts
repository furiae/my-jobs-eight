import { NextRequest, NextResponse } from "next/server";
import { runAutoApply } from "@/lib/apply/engine";

// POST /api/apply — triggers auto-apply run
// Query params:
//   limit=N    max jobs to attempt (default 10, max 50)
//   dry_run=1  filter only, do not open browser
//
// Secured by CRON_SECRET header (same secret used by Vercel/GitHub Actions crons)

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (expected && secret !== expected && secret !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "10"), 50);
  const dryRun = url.searchParams.get("dry_run") === "1";

  try {
    const summary = await runAutoApply({
      databaseUrl: process.env.DATABASE_URL,
      limit,
      dryRun,
    });

    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    console.error("[auto-apply]", err);
    return NextResponse.json(
      { error: "apply_run_failed", detail: String(err) },
      { status: 500 }
    );
  }
}

// GET /api/apply — returns recent applications from DB
export async function GET(req: NextRequest) {
  const { neon } = await import("@neondatabase/serverless");
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }
  const sql = neon(process.env.DATABASE_URL);

  const rows = await sql`
    SELECT a.*, j.salary, j.description
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    ORDER BY a.created_at DESC
    LIMIT 100
  `;

  return NextResponse.json({ applications: rows });
}
