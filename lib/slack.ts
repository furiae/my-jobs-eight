/**
 * General-purpose Slack messaging utility.
 *
 * Uses the Slack Bot API (SLACK_BOT_TOKEN + SLACK_CHANNEL_ID) to post
 * messages outside of the auto-apply notification flow.
 *
 * Use cases: CTO recommendations, issue alerts, deploy notifications.
 */

export async function postSlackMessage(text: string, blocks?: object[]): Promise<boolean> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CHANNEL_ID;

  if (!botToken || !channelId) {
    console.warn("[slack] SLACK_BOT_TOKEN or SLACK_CHANNEL_ID not set — skipping");
    return false;
  }

  const payload: Record<string, unknown> = { channel: channelId, text };
  if (blocks) payload.blocks = blocks;

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!data.ok) {
    console.error(`[slack] API error: ${data.error}`);
    return false;
  }
  return true;
}

/**
 * Notify the board that a task is blocked and needs human attention.
 */
export async function notifyBlockedTask(
  identifier: string,
  title: string,
  blockerSummary: string,
  issueUrl?: string,
): Promise<boolean> {
  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `🚫 Blocked: ${identifier}` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${title}*\n\n${blockerSummary}` },
    },
    ...(issueUrl
      ? [
          {
            type: "section",
            text: { type: "mrkdwn", text: `<${issueUrl}|View in Paperclip>` },
          },
        ]
      : []),
  ];

  return postSlackMessage(`Blocked: ${identifier} — ${title}`, blocks);
}

/**
 * Post a recommendation summary to Slack with a link to the Paperclip issue.
 */
export async function notifyRecommendation(
  title: string,
  summary: string,
  issueUrl?: string,
): Promise<boolean> {
  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `💡 CTO Recommendation: ${title}` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: summary },
    },
    ...(issueUrl
      ? [
          {
            type: "section",
            text: { type: "mrkdwn", text: `<${issueUrl}|View in Paperclip>` },
          },
        ]
      : []),
  ];

  return postSlackMessage(`CTO Recommendation: ${title}`, blocks);
}

/**
 * Notify the board that a task has been completed.
 */
export async function notifyTaskComplete(
  identifier: string,
  title: string,
  summary: string,
  issueUrl?: string,
): Promise<boolean> {
  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `✅ Done: ${identifier}` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${title}*\n\n${summary}` },
    },
    ...(issueUrl
      ? [
          {
            type: "section",
            text: { type: "mrkdwn", text: `<${issueUrl}|View in Paperclip>` },
          },
        ]
      : []),
  ];

  return postSlackMessage(`Done: ${identifier} — ${title}`, blocks);
}
