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
 * Also acknowledges receipt: adds 👀 reaction to stored messages and posts
 * a brief threaded reply for non-threaded (GENERAL) messages.
 *
 * Env vars: SLACK_SIGNING_SECRET, SLACK_BOT_TOKEN, DATABASE_URL,
 *           PAPERCLIP_WEBHOOK_URL, PAPERCLIP_WEBHOOK_SECRET
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

/** Add a reaction to a Slack message. */
async function addReaction(channel: string, ts: string, emoji: string): Promise<void> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) return;

  await fetch("https://slack.com/api/reactions.add", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify({ channel, timestamp: ts, name: emoji }),
  });
}

/** Fire the Paperclip webhook to trigger a CTO heartbeat. */
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
      body: JSON.stringify({ source: "slack_message" }),
    });
    if (!res.ok) {
      console.error(`[slack-events] Webhook fire failed: ${res.status}`);
    } else {
      console.log("[slack-events] Paperclip heartbeat triggered via webhook");
    }
  } catch (err) {
    console.error("[slack-events] Webhook fire error:", err);
  }
}

/** Post a threaded reply to a Slack message. */
async function postThreadReply(channel: string, threadTs: string, text: string): Promise<void> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) return;

  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify({ channel, thread_ts: threadTs, text }),
  });
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

    // Process user messages (not bot messages, not subtypes like joins)
    if (
      event.type === "message" &&
      !event.subtype &&
      !event.bot_id &&
      event.text
    ) {
      const channel = event.channel!;
      const replyText = event.text;
      const slackUser = event.user || "unknown";

      try {
        const sql = neon(process.env.DATABASE_URL!);
        let identifier: string | null = null;

        if (event.thread_ts) {
          // Thread reply — extract issue identifier from parent message
          const parentMessage = await fetchSlackMessage(channel, event.thread_ts);
          if (parentMessage) {
            identifier = extractIssueIdentifier(parentMessage);
          }
        }

        // Also check the message itself for an issue identifier
        if (!identifier) {
          const selfMatch = replyText.match(/\b([A-Z]+-\d+)\b/);
          if (selfMatch) identifier = selfMatch[1];
        }

        // Store in database — use "GENERAL" for messages without a specific issue
        const isGeneral = !identifier;
        await sql`
          INSERT INTO slack_replies (issue_identifier, slack_user, reply_text, slack_channel, slack_thread_ts, slack_message_ts)
          VALUES (${identifier || "GENERAL"}, ${slackUser}, ${replyText}, ${channel}, ${event.thread_ts || null}, ${event.ts || null})
        `;
        console.log(`[slack-events] Stored message for ${identifier || "GENERAL"} from ${slackUser}`);

        // Acknowledge receipt — add 👀 reaction
        if (event.ts) {
          await addReaction(channel, event.ts, "eyes");
        }

        // For non-threaded messages, post a brief threaded reply and trigger heartbeat
        if (isGeneral && !event.thread_ts && event.ts) {
          await postThreadReply(
            channel,
            event.ts,
            "Got it — logging for triage and waking the CTO agent now.",
          );
          await firePaperclipWebhook();
        }
      } catch (err) {
        console.error("[slack-events] Error processing message:", err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
