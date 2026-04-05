/**
 * Application notifications.
 *
 * Sends a Slack webhook message and creates Paperclip tasks for every
 * application that requires manual attention (failed or manual_required).
 *
 * Required environment variables:
 *   SLACK_WEBHOOK_URL        — Incoming Webhook URL from your Slack app
 *   PAPERCLIP_API_URL        — Paperclip control-plane base URL
 *   PAPERCLIP_API_KEY        — Paperclip agent API key (short-lived JWT or long-lived key)
 *   PAPERCLIP_COMPANY_ID     — Paperclip company ID
 *   PAPERCLIP_PARENT_ISSUE_ID — Issue ID to parent manual-apply tasks under (FUR-22)
 *   PAPERCLIP_PROJECT_ID     — Project ID for newly created tasks
 *   PAPERCLIP_ASSIGNEE_USER_ID — Board user ID to assign manual-apply tasks to
 */

import type { RunSummary } from "./apply/engine";
import type { ApplicationRecord } from "./apply/types";
import { Resend } from "resend";

// ── Slack ─────────────────────────────────────────────────────────────────────

function statusEmoji(status: ApplicationRecord["status"]): string {
  switch (status) {
    case "applied":         return "✅";
    case "failed":          return "❌";
    case "manual_required": return "👋";
    case "skipped":         return "⏭️";
    default:                return "⏳";
  }
}

function buildSlackBlocks(summary: RunSummary): object {
  const lines = summary.records.map((r) => {
    const emoji = statusEmoji(r.status);
    const jobLink = `<${r.jobUrl}|${r.jobTitle} @ ${r.company}>`;
    const detail  = r.errorMessage ? ` — \`${r.errorMessage}\`` : "";
    return `${emoji} ${jobLink}${detail}`;
  });

  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `Job Application Run — ${new Date().toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric",
          })}`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Attempted*\n${summary.attempted}` },
          { type: "mrkdwn", text: `*Applied ✅*\n${summary.applied}` },
          { type: "mrkdwn", text: `*Manual needed 👋*\n${summary.manual}` },
          { type: "mrkdwn", text: `*Failed ❌*\n${summary.failed}` },
        ],
      },
      ...(lines.length > 0
        ? [
            { type: "divider" },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: lines.slice(0, 40).join("\n"), // Slack block text limit
              },
            },
          ]
        : []),
    ],
  };
}

export async function notifySlack(summary: RunSummary): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return; // silently skip — not configured

  const payload = buildSlackBlocks(summary);
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error(`[notify] Slack webhook failed: ${res.status} ${await res.text()}`);
  }
}

// ── Discord ──────────────────────────────────────────────────────────────────

function buildDiscordEmbed(summary: RunSummary): object {
  const lines = summary.records.map((r) => {
    const emoji = statusEmoji(r.status);
    const detail = r.errorMessage ? ` — \`${r.errorMessage}\`` : "";
    return `${emoji} [${r.jobTitle} @ ${r.company}](${r.jobUrl})${detail}`;
  });

  return {
    embeds: [
      {
        title: `Job Application Run — ${new Date().toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric",
        })}`,
        color: summary.failed > 0 ? 0xff4444 : 0x44bb44,
        fields: [
          { name: "Attempted", value: `${summary.attempted}`, inline: true },
          { name: "Applied ✅", value: `${summary.applied}`, inline: true },
          { name: "Manual 👋", value: `${summary.manual}`, inline: true },
          { name: "Failed ❌", value: `${summary.failed}`, inline: true },
        ],
        description: lines.slice(0, 30).join("\n") || "No applications this run.",
      },
    ],
  };
}

export async function notifyDiscord(summary: RunSummary): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const payload = buildDiscordEmbed(summary);
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error(`[notify] Discord webhook failed: ${res.status} ${await res.text()}`);
  }
}

// ── Email (Resend) ───────────────────────────────────────────────────────────

function buildEmailHtml(summary: RunSummary): string {
  const rows = summary.records
    .map((r) => {
      const emoji = statusEmoji(r.status);
      const error = r.errorMessage ? `<br><small>${r.errorMessage}</small>` : "";
      return `<tr><td>${emoji}</td><td><a href="${r.jobUrl}">${r.jobTitle} @ ${r.company}</a>${error}</td><td>${r.status}</td></tr>`;
    })
    .join("\n");

  return `
    <h2>Job Application Run — ${new Date().toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    })}</h2>
    <p><strong>Attempted:</strong> ${summary.attempted} | <strong>Applied:</strong> ${summary.applied} | <strong>Manual:</strong> ${summary.manual} | <strong>Failed:</strong> ${summary.failed}</p>
    <table border="1" cellpadding="4" cellspacing="0">
      <tr><th></th><th>Job</th><th>Status</th></tr>
      ${rows}
    </table>
  `;
}

export async function notifyEmail(summary: RunSummary): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFICATION_EMAIL;
  if (!apiKey || !to) return;

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: "Jobs <jobs@notifications.furiae-interactive.com>",
    to: [to],
    subject: `Job Applications: ${summary.applied} applied, ${summary.manual} manual, ${summary.failed} failed`,
    html: buildEmailHtml(summary),
  });

  if (error) {
    console.error(`[notify] Email failed:`, error);
  }
}

// ── Paperclip tasks ───────────────────────────────────────────────────────────

async function createPaperclipIssue(title: string, description: string): Promise<void> {
  const apiUrl    = process.env.PAPERCLIP_API_URL;
  const apiKey    = process.env.PAPERCLIP_API_KEY;
  const companyId = process.env.PAPERCLIP_COMPANY_ID;
  const parentId  = process.env.PAPERCLIP_PARENT_ISSUE_ID;
  const projectId = process.env.PAPERCLIP_PROJECT_ID;
  const assigneeUserId = process.env.PAPERCLIP_ASSIGNEE_USER_ID ?? "local-board";

  if (!apiUrl || !apiKey || !companyId) return; // silently skip — not configured

  const body: Record<string, unknown> = {
    title,
    description,
    status: "todo",
    priority: "medium",
    assigneeUserId,
  };
  if (parentId)  body.parentId  = parentId;
  if (projectId) body.projectId = projectId;

  const res = await fetch(`${apiUrl}/api/companies/${companyId}/issues`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`[notify] Paperclip issue create failed: ${res.status} ${await res.text()}`);
  }
}

export async function notifyPaperclip(summary: RunSummary): Promise<void> {
  const needsManual = summary.records.filter(
    (r) => r.status === "manual_required" || r.status === "failed"
  );

  // Fire in parallel but don't let failures block the response
  await Promise.allSettled(
    needsManual.map((r) => {
      const statusLabel = r.status === "manual_required" ? "Manual apply needed" : "Application failed";
      const title = `${statusLabel}: ${r.jobTitle} @ ${r.company}`;
      const description =
        `**Status:** ${r.status}\n` +
        `**Job URL:** ${r.jobUrl}\n` +
        (r.applyUrl ? `**Apply URL:** ${r.applyUrl}\n` : "") +
        (r.errorMessage ? `**Error:** \`${r.errorMessage}\`\n` : "") +
        `\nPlease review and apply manually if this role is a good fit.`;
      return createPaperclipIssue(title, description);
    })
  );
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function sendNotifications(summary: RunSummary): Promise<void> {
  if (summary.attempted === 0) return; // nothing to notify about

  await Promise.allSettled([
    notifySlack(summary),
    notifyDiscord(summary),
    notifyEmail(summary),
    notifyPaperclip(summary),
  ]);
}
