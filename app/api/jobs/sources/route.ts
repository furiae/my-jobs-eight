import { NextResponse } from "next/server";
import { getJobSources } from "@/lib/db";

export async function GET() {
  try {
    const sources = await getJobSources();
    return NextResponse.json({ sources });
  } catch (err) {
    console.error("Sources fetch error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
