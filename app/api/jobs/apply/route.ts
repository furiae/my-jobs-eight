import { NextRequest, NextResponse } from "next/server";
import { markJobApplied, unmarkJobApplied } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { jobId } = await req.json();
    if (!jobId) {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }
    const job = await markJobApplied(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found or already applied" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, job });
  } catch (err) {
    console.error("Apply error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { jobId } = await req.json();
    if (!jobId) {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }
    const job = await unmarkJobApplied(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, job });
  } catch (err) {
    console.error("Unapply error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
