import { runAutoApply } from "../lib/apply/engine";
import { sendNotifications } from "../lib/notify";

(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  // Parse CLI args: --limit N, --dry-run
  const args = process.argv.slice(2);
  let limit = 50;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      limit = Math.min(Number(args[i + 1]), 200);
      i++;
    }
    if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  try {
    console.log(`Starting auto-apply run with limit=${limit}, dryRun=${dryRun}...`);
    const summary = await runAutoApply({ databaseUrl, limit, dryRun });

    console.log("=== AUTO-APPLY SUMMARY ===");
    console.log(JSON.stringify(summary, null, 2));

    // Send notifications (email, Slack, Discord, Paperclip)
    if (!dryRun) {
      await sendNotifications(summary);
      console.log("Notifications sent.");
    }
  } catch (error) {
    console.error("Error running auto-apply:", error);
    process.exit(1);
  }
})();
