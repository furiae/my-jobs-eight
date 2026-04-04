/**
 * POST /api/cover-letter
 * Generate a preview of an AI-customized cover letter without auto-applying.
 *
 * Body: { title: string, company: string, description?: string }
 * Returns: { text: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { generateCoverLetter } from "@/lib/apply/cover-letter";
import { PROFILE } from "@/lib/apply/profile";
import { deleteTempFile } from "@/lib/apply/cover-letter";

export async function POST(req: NextRequest) {
  try {
    const { title, company, description } = await req.json();

    if (!title || !company) {
      return NextResponse.json(
        { error: "title and company are required" },
        { status: 400 }
      );
    }

    const result = await generateCoverLetter(
      { title, company, description: description ?? null },
      PROFILE
    );

    // Clean up temp file — we only need the text for the preview
    deleteTempFile(result.tempFilePath);

    return NextResponse.json({ text: result.text });
  } catch (err) {
    console.error("[cover-letter] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
