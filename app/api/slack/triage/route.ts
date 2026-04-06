/**
 * GET  /api/slack/triage — returns unprocessed GENERAL (non-threaded) Slack messages
 * POST /api/slack/triage — marks message IDs as processed
 *
 * Auth: CRON_SECRET header (same as other internal endpoints).
 *
 * The CTO agent calls GET during heartbeats to discover new non-threaded
 * messages, creates Paperclip issues for each, then calls POST to mark
 * them processed.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getUnprocessedGeneralReplies,
  markSlackRepliesProcessed,
} from "@/lib/db";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const messages = await getUnprocessedGeneralReplies();
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const ids: number[] = body.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }

  await markSlackRepliesProcessed(ids);
  return NextResponse.json({ processed: ids.length });
}
