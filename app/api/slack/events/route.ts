/**
 * POST /api/slack/events
 *
 * Slack Events API endpoint. Receives events from Slack and stores them
 * in the database for the CTO agent to route to Paperclip during heartbeats.
 *
 * Flow:
 *   1. User replies in a Slack thread to a bot notification
 *   2. Slack sends a `message` event here
 *   3. We extract the issue identifier from the parent message
 *   4. We store the reply in `slack_replies` table
 *   5. The CTO agent picks up unprocessed replies and posts them to Paperclip
 *
 * Env vars: SLACK_SIGNING_SECRET, SLACK_BOT_TOKEN, DATABASE_URL
 */

import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

// ── Slack request verification ───────────────────────────────────────────────

function verifySlackRequest(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;

  const baseString = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac("sha256", signingSecret).update(baseString).digest("hex");
  const expected = `v0=${hmac}`;

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract issue identifier (e.g. FUR-141) from a Slack message's text or blocks. */
function extractIssueIdentifier(message: SlackMessage): string | null {
  const text = message.text || "";
  const match = text.match(/\b([A-Z]+-\d+)\b/);
  if (match) return match[1];

  if (message.blocks) {
    for (const block of message.blocks) {
      const blockText = block?.text?.text || "";
      const blockMatch = blockText.match(/\b([A-Z]+-\d+)\b/);
      if (blockMatch) return blockMatch[1];
    }
  }

  return null;
}

/** Fetch a Slack message by channel + timestamp. */
async function fetchSlackMessage(channel: string, ts: string): Promise<SlackMessage | null> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) return null;

  const res = await fetch(
    `https://slack.com/api/conversations.history?channel=${channel}&latest=${ts}&inclusive=true&limit=1`,
    { headers: { Authorization: `Bearer ${botToken}` } },
  );
  const data = await res.json();
  if (!data.ok || !data.messages?.length) return null;
  return data.messages[0];
}

// ── Types ────────────────────────────────────────────────────────────────────

interface SlackMessage {
  text?: string;
  blocks?: Array<{ text?: { text?: string } }>;
  bot_id?: string;
  user?: string;
  thread_ts?: string;
  ts?: string;
}

interface SlackEvent {
  type: string;
  challenge?: string;
  token?: string;
  event?: {
    type: string;
    subtype?: string;
    text?: string;
    user?: string;
    bot_id?: string;
    channel?: string;
    thread_ts?: string;
    ts?: string;
  };
}

// ── Handler ──────────────────────────────────────────────────────────────────

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

  const payload: SlackEvent = JSON.parse(rawBody);

  // Handle Slack URL verification challenge
  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  // Handle event callbacks
  if (payload.type === "event_callback" && payload.event) {
    const event = payload.event;

    // Only process user messages in threads (not bot messages, not subtypes)
    if (
      event.type === "message" &&
      !event.subtype &&
      !event.bot_id &&
      event.thread_ts &&
      event.text
    ) {
      const channel = event.channel!;
      const threadTs = event.thread_ts;
      const replyText = event.text;
      const slackUser = event.user || "unknown";

      try {
        // Fetch the parent message to find the issue identifier
        const parentMessage = await fetchSlackMessage(channel, threadTs);
        if (!parentMessage) {
          console.warn("[slack-events] Could not fetch parent message");
          return NextResponse.json({ ok: true });
        }

        const identifier = extractIssueIdentifier(parentMessage);
        if (!identifier) {
          console.warn("[slack-events] No issue identifier in parent message");
          return NextResponse.json({ ok: true });
        }

        // Store in database for the CTO agent to pick up
        const sql = neon(process.env.DATABASE_URL!);
        await sql`
          INSERT INTO slack_replies (issue_identifier, slack_user, reply_text, slack_channel, slack_thread_ts, slack_message_ts)
          VALUES (${identifier}, ${slackUser}, ${replyText}, ${channel}, ${threadTs}, ${event.ts || null})
        `;
        console.log(`[slack-events] Stored reply for ${identifier} from ${slackUser}`);
      } catch (err) {
        console.error("[slack-events] Error processing thread reply:", err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
