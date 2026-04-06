/**
 * POST /api/slack/commands — Slack slash command handler
 *   Receives `/furiae <title>` commands from Slack, stores them for CTO processing,
 *   and fires the Paperclip webhook to trigger a heartbeat.
 *
 * GET  /api/slack/commands — returns unprocessed slash commands (auth: CRON_SECRET)
 * PATCH /api/slack/commands — marks command IDs as processed (auth: CRON_SECRET)
 *
 * Env vars: SLACK_SIGNING_SECRET, DATABASE_URL,
 *           PAPERCLIP_WEBHOOK_URL, PAPERCLIP_WEBHOOK_SECRET, CRON_SECRET
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  insertSlackCommand,
  getUnprocessedSlackCommands,
  markSlackCommandProcessed,
} from "@/lib/db";

// ── Slack request verification ──────────────────────────────────────────────

function verifySlackRequest(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;

  const baseString = `v0:${timestamp}:${body}`;
  const hmac = crypto
    .createHmac("sha256", signingSecret)
    .update(baseString)
    .digest("hex");
  const expected = `v0=${hmac}`;

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function firePaperclipWebhook(): Promise<void> {
  const webhookUrl = process.env.PAPERCLIP_WEBHOOK_URL;
  const webhookSecret = process.env.PAPERCLIP_WEBHOOK_SECRET;
  if (!webhookUrl || !webhookSecret) return;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${webhookSecret}`,
      },
      body: JSON.stringify({ source: "slack_command" }),
    });
    if (!res.ok) {
      console.error(`[slack-commands] Webhook fire failed: ${res.status}`);
    }
  } catch (err) {
    console.error("[slack-commands] Webhook fire error:", err);
  }
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

// ── POST: Slack slash command ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Verify Slack signature
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const timestamp = req.headers.get("x-slack-request-timestamp") || "";
  const signature = req.headers.get("x-slack-signature") || "";

  if (signingSecret && timestamp && signature) {
    if (!verifySlackRequest(signingSecret, timestamp, rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  // Slack slash commands are application/x-www-form-urlencoded
  const params = new URLSearchParams(rawBody);
  const command = params.get("command") || "";
  const text = (params.get("text") || "").trim();
  const userId = params.get("user_id") || "";
  const userName = params.get("user_name") || "";
  const channelId = params.get("channel_id") || "";
  const responseUrl = params.get("response_url") || null;

  // Usage help if no text provided
  if (!text) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: "Usage: `/furiae <issue title>`\nExample: `/furiae Fix the login page styling`",
    });
  }

  try {
    await insertSlackCommand({
      command,
      commandText: text,
      slackUserId: userId,
      slackUserName: userName,
      slackChannelId: channelId,
      responseUrl,
    });

    // Fire webhook to wake CTO agent
    await firePaperclipWebhook();

    return NextResponse.json({
      response_type: "in_channel",
      text: `📝 Creating issue: *${text}*\nI'll post a confirmation with the issue link shortly.`,
    });
  } catch (err) {
    console.error("[slack-commands] Error storing command:", err);
    return NextResponse.json({
      response_type: "ephemeral",
      text: "Something went wrong storing the command. Please try again.",
    });
  }
}

// ── GET: List unprocessed commands (CTO triage) ─────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commands = await getUnprocessedSlackCommands();
  return NextResponse.json({ commands });
}

// ── PATCH: Mark command as processed ────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id, paperclipIssueId } = body;

  if (!id || !paperclipIssueId) {
    return NextResponse.json(
      { error: "id and paperclipIssueId required" },
      { status: 400 },
    );
  }

  await markSlackCommandProcessed(id, paperclipIssueId);
  return NextResponse.json({ processed: true });
}
