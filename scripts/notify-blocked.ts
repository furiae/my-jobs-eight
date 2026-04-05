/**
 * CLI script to send a Slack notification when a task is blocked.
 *
 * Usage:
 *   npx tsx scripts/notify-blocked.ts <identifier> <title> <blocker-summary> [issue-url]
 *
 * Example:
 *   npx tsx scripts/notify-blocked.ts FUR-131 "Configure Firecrawl API key" "Need board to sign up at firecrawl.dev"
 */
import { notifyBlockedTask } from "../lib/slack";

const [identifier, title, blockerSummary, issueUrl] = process.argv.slice(2);

if (!identifier || !title || !blockerSummary) {
  console.error(
    "Usage: npx tsx scripts/notify-blocked.ts <identifier> <title> <blocker-summary> [issue-url]",
  );
  process.exit(1);
}

(async () => {
  const sent = await notifyBlockedTask(identifier, title, blockerSummary, issueUrl);
  if (sent) {
    console.log(`Slack notification sent for blocked task ${identifier}`);
  } else {
    console.log("Slack notification skipped (no SLACK_BOT_TOKEN/SLACK_CHANNEL_ID)");
  }
})();
