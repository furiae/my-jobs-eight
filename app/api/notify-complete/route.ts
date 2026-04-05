import { NextRequest, NextResponse } from "next/server";
import { notifyTaskComplete } from "@/lib/slack";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { identifier, title, summary, issueUrl } = await req.json();

  if (!identifier || !title || !summary) {
    return NextResponse.json(
      { error: "Missing required fields: identifier, title, summary" },
      { status: 400 },
    );
  }

  const sent = await notifyTaskComplete(identifier, title, summary, issueUrl);
  return NextResponse.json({ sent });
}
