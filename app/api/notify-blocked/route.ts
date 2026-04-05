import { NextRequest, NextResponse } from "next/server";
import { notifyBlockedTask } from "@/lib/slack";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { identifier, title, blockerSummary, issueUrl } = await req.json();

  if (!identifier || !title || !blockerSummary) {
    return NextResponse.json(
      { error: "Missing required fields: identifier, title, blockerSummary" },
      { status: 400 },
    );
  }

  const sent = await notifyBlockedTask(identifier, title, blockerSummary, issueUrl);
  return NextResponse.json({ sent });
}
