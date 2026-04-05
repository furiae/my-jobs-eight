/**
 * GET /api/resume
 * Serves the resume PDF file for viewing/downloading.
 *
 * Query params:
 *   ?download=true — forces download instead of inline view
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { PROFILE } from "@/lib/apply/profile";

export async function GET(req: NextRequest) {
  try {
    const pdf = await readFile(PROFILE.resumePath);
    const download = req.nextUrl.searchParams.get("download") === "true";

    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="Chris-Johnson-Resume.pdf"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[resume] error:", err);
    return NextResponse.json({ error: "Resume file not found" }, { status: 404 });
  }
}
