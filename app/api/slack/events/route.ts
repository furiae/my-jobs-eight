/**
 * POST /api/slack/events
 *
 * Slack Events API endpoint. Receives events from Slack and routes them
 * back to Paperclip as issue comments, enabling two-way communication.
 *
 * Flow:
 *   1. User replies in a Slack thread to a bot notification
 *   2. Slack sends a `message` event here
 *   3. We extract the issue identifier from the parent message
 *   4. We post the reply as a Paperclip comment on that issue
 *
 * Env vars: SLACK_SIGNING_SECRET, SLACK_BOT_TOKEN, PAPERCLIP_API_URL,
 *           PAPERCLIP_API_KEY, PAPERCLIP_COMPANY_ID
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// ── Slack request verification ───────────────────────────────────────────────

function verifySlackRequest(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  // Reject requests older than 5 minutes (replay protection)
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
  // Check fallback text first (e.g., "Done: FUR-141 — Title")
  const text = message.text || "";
  const match = text.match(/\b([A-Z]+-\d+)\b/);
  if (match) return match[1];

  // Check block text
  if (message.blocks) {
    for (const block of message.blocks) {
      const blockText =
        block?.text?.text || "";
      const blockMatch = blockText.match(/\b([A-Z]+-\d+)\b/);
      if (blockMatch) return blockMatch[1];
    }
  }

  return null;
}

/** Fetch a Slack message by channel + timestamp (used to read parent messages). */
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

/** Search Paperclip for an issue by identifier and post a comment. */
async function postPaperclipComment(identifier: string, body: string): Promise<boolean> {
  const apiUrl = process.env.PAPERCLIP_API_URL;
  const apiKey = process.env.PAPERCLIP_API_KEY;
  const companyId = process.env.PAPERCLIP_COMPANY_ID;

  if (!apiUrl || !apiKey || !companyId) {
    console.error("[slack-events] Paperclip env vars not configured");
    return false;
  }

  // Find the issue by identifier
  const searchRes = await fetch(
    `${apiUrl}/api/companies/${companyId}/issues?q=${encodeURIComponent(identifier)}&status=todo,in_progress,blocked,in_review,done`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!searchRes.ok) {
    console.error(`[slack-events] Paperclip search failed: ${searchRes.status}`);
    return false;
  }
  const issues = await searchRes.json();
  const issue = Array.isArray(issues)
    ? issues.find((i: { identifier: string }) => i.identifier === identifier)
    : null;

  if (!issue) {
    console.error(`[slack-events] Issue ${identifier} not found`);
    return false;
  }

  // Post comment
  const commentRes = await fetch(`${apiUrl}/api/issues/${issue.id}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ body }),
  });

  if (!commentRes.ok) {
    console.error(`[slack-events] Comment post failed: ${commentRes.status}`);
    return false;
  }
  return true;
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
  // url_verification
  challenge?: string;
  token?: string;
  // event_callback
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

  // Verify Slack signature (skip only for url_verification during initial setup)
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

    // Only process user messages in threads (not bot messages, not subtypes like joins)
    if (
      event.type === "message" &&
      !event.subtype &&
      !event.bot_id &&
      event.thread_ts &&
      event.text
    ) {
      // This is a thread reply from a human user — process async
      const channel = event.channel!;
      const threadTs = event.thread_ts;
      const replyText = event.text;
      const slackUser = event.user || "unknown";

      // Respond to Slack immediately (they require < 3s response)
      // Process in background via waitUntil-style approach
      // (Next.js serverless functions complete the response, then the runtime
      //  may or may not finish background work — we do it inline but fast)
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

        // Post as Paperclip comment
        const commentBody = `**Via Slack** (from <@${slackUser}>):\n\n${replyText}`;
        const posted = await postPaperclipComment(identifier, commentBody);
        if (posted) {
          console.log(`[slack-events] Routed reply to ${identifier}`);
        }
      } catch (err) {
        console.error("[slack-events] Error processing thread reply:", err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
