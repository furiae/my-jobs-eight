# Slack Integration Setup for Paperclip + Jobs Board

This guide explains how to set up Slack notifications for the Furiae Jobs Board project so that a Paperclip CTO agent can notify you via Slack when tasks are blocked, completed, or need your attention.

---

## Overview

The integration uses a **Slack Bot** (via Bot OAuth Token) to post messages to a specific channel. The bot posts notifications for:

1. **Blocked tasks** — when the CTO agent is stuck and needs human input
2. **Completed tickets** — when auto-apply runs finish (with success/failure breakdown)
3. **Attention needed** — CTO recommendations, deploy notifications, and manual-apply alerts

### Architecture

```
Paperclip Agent (CTO)
  ├─> lib/slack.ts — notifyBlockedTask()      → 🚫 Blocked alerts
  ├─> lib/slack.ts — notifyTaskComplete()      → ✅ Task completed alerts
  └─> lib/slack.ts — notifyRecommendation()    → 💡 Recommendation alerts
        └─> Slack Web API (chat.postMessage)
              └─> Your Slack channel

GitHub Actions (Auto-Apply)
  └─> lib/notify.ts — notifySlack()            → 📋 Auto-apply run summaries
        └─> Slack Web API (chat.postMessage)
              └─> Your Slack channel

API Endpoints
  ├─> /api/notify-blocked   → lib/slack.ts (notifyBlockedTask)
  └─> /api/notify-complete  → lib/slack.ts (notifyTaskComplete)
```

---

## Step 1: Create a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Click **"Create New App"** > **"From scratch"**
3. Name it something like `Furiae Bot` (or any name you prefer)
4. Select your Slack workspace
5. Click **"Create App"**

## Step 2: Configure Bot Scopes

1. In the app settings sidebar, go to **"OAuth & Permissions"**
2. Scroll to **"Scopes"** > **"Bot Token Scopes"**
3. Add the following scopes:

| Scope | Purpose |
|-------|---------|
| `chat:write` | Post messages to channels the bot is a member of |
| `chat:write.public` | Post messages to any public channel without joining (recommended) |
| `channels:read` | Read basic channel info |
| `channels:history` | Read message history (optional, for context) |
| `reactions:write` | Add reactions to messages (acknowledgment) |
| `im:write` | Send direct messages (optional) |
| `users:read` | Look up user info (optional) |

**Minimum required:** `chat:write`, `chat:write.public`, and `reactions:write`

The `chat:write.public` scope is key — it lets the bot post to public channels without needing to be manually invited.

## Step 3: Install the App to Your Workspace

1. Still in **"OAuth & Permissions"**, scroll to the top
2. Click **"Install to Workspace"** (or "Reinstall" if updating scopes)
3. Review the permissions and click **"Allow"**
4. Copy the **"Bot User OAuth Token"** — it starts with `xoxb-`

**Save this token** — you'll need it as `SLACK_BOT_TOKEN` in the next steps.

## Step 4: Get Your Channel ID

1. Open Slack and navigate to the channel where you want notifications
2. Right-click the channel name > **"View channel details"** (or click the channel name at the top)
3. Scroll to the bottom of the details panel
4. Copy the **Channel ID** — it looks like `C0AQVDCMTM3`

Alternatively, in the Slack desktop app:
- Right-click the channel > "Copy" > "Copy link"
- The URL contains the channel ID: `https://app.slack.com/client/T.../C0AQVDCMTM3`

**Save this ID** — you'll need it as `SLACK_CHANNEL_ID`.

## Step 5: Set Environment Variables

You need to set `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID` in **three places**:

### 5a. Vercel (for production API endpoints)

```bash
# From the project directory (must have vercel CLI linked)
vercel env add SLACK_BOT_TOKEN
# Paste your xoxb-... token when prompted
# Select: Production, Preview, Development

vercel env add SLACK_CHANNEL_ID
# Paste your channel ID (e.g., C0AQVDCMTM3)
# Select: Production, Preview, Development
```

Or set them in the Vercel Dashboard:
1. Go to your project > Settings > Environment Variables
2. Add `SLACK_BOT_TOKEN` with your `xoxb-...` token
3. Add `SLACK_CHANNEL_ID` with your channel ID
4. Enable for Production, Preview, and Development environments

### 5b. GitHub Actions (for auto-apply workflow notifications)

```bash
# Using gh CLI
gh secret set SLACK_BOT_TOKEN --repo <owner>/<repo>
# Paste your xoxb-... token

gh secret set SLACK_CHANNEL_ID --repo <owner>/<repo>
# Paste your channel ID
```

Or in GitHub:
1. Go to repo > Settings > Secrets and variables > Actions
2. Add `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID` as repository secrets

### 5c. Local development (.env.local)

```bash
# Pull from Vercel (easiest)
vercel env pull .env.local

# Or add manually to .env.local
echo 'SLACK_BOT_TOKEN=xoxb-your-token-here' >> .env.local
echo 'SLACK_CHANNEL_ID=C0AQVDCMTM3' >> .env.local
```

## Step 6: Also Set CRON_SECRET (for notification API endpoints)

The `/api/notify-blocked` and `/api/notify-complete` endpoints require authentication via `CRON_SECRET`. This is used when the CTO agent or CLI scripts call these endpoints.

```bash
# Generate a random secret
openssl rand -hex 32

# Set it in Vercel
vercel env add CRON_SECRET
# Paste the generated secret
# Select: Production, Preview, Development

# Set it in GitHub Actions
gh secret set CRON_SECRET --repo <owner>/<repo>

# Set it locally
echo 'CRON_SECRET=your-generated-secret' >> .env.local
```

## Step 7: Test the Integration

### Quick test (post a message directly)

```bash
curl -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer xoxb-YOUR-TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channel":"YOUR_CHANNEL_ID","text":"Test message from Furiae bot"}'
```

You should see `{"ok":true,...}` and the message in your Slack channel.

### Test via the notify-blocked endpoint

```bash
curl -X POST https://your-app.vercel.app/api/notify-blocked \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "TEST-001",
    "title": "Test blocked task",
    "blockerSummary": "This is a test notification"
  }'
```

### Test via the notify-complete endpoint

```bash
curl -X POST https://your-app.vercel.app/api/notify-complete \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "TEST-002",
    "title": "Test completed task",
    "summary": "This task was completed successfully."
  }'
```

### Test via CLI script (local)

```bash
npx tsx scripts/notify-blocked.ts TEST-001 "Test task" "Testing Slack notifications"
```

---

## How Notifications Work

### 1. Blocked Task Notifications

**When:** The CTO agent encounters a blocker on any task.

**How it works:**
- The agent calls `POST /api/notify-blocked` with the task details
- The endpoint calls `notifyBlockedTask()` from `lib/slack.ts`
- A rich Slack message is posted with the task identifier, title, blocker description, and a link to the Paperclip issue

**Slack message format:**
```
🚫 Blocked: FUR-123
Task Title Here

Description of what's blocking progress and who needs to act.

View in Paperclip (link)
```

### 2. Task Completed Notifications

**When:** The CTO agent finishes any Paperclip task.

**How it works:**
- The agent calls `POST /api/notify-complete` (or `notifyTaskComplete()` directly) when marking an issue as `done`
- A rich Slack message is posted with the task identifier, title, summary of work done, and a link to the Paperclip issue

**Slack message format:**
```
✅ Done: FUR-141
Jobs Board - Fix errors

Fixed all 4 GitHub Actions and Vercel deployment failures.
Added missing secrets and improved scrape workflow validation.

View in Paperclip (link)
```

### 3. Auto-Apply Run Notifications

**When:** The hourly auto-apply workflow completes (via GitHub Actions).

**How it works:**
- After `scripts/run-apply.ts` finishes, it calls `sendNotifications()` from `lib/notify.ts`
- `notifySlack()` posts a summary with applied/failed/manual counts and per-job details

**Slack message format:**
```
Job Application Run — Apr 5, 2026

Attempted: 12  |  Applied ✅: 3  |  Manual needed 👋: 7  |  Failed ❌: 2

✅ Senior UX Designer @ Acme Corp
👋 Product Designer @ StartupCo — manual_required: no_apply_url
❌ UI Designer @ BigTech — failed: timeout_loading_page
...
```

### 4. CTO Recommendations

**When:** The CTO agent has tool/MCP/process recommendations.

**How it works:**
- The agent calls `notifyRecommendation()` from `lib/slack.ts`
- A summary is posted with a link to the full Paperclip issue

**Slack message format:**
```
💡 CTO Recommendation: Install Firecrawl MCP
Summary of the recommendation with pros/cons...

View in Paperclip (link)
```

---

## Two-Way Communication (Slack → Paperclip)

By default, Slack integration is one-way (bot posts notifications). With the Events API setup below, you can **reply to notifications in Slack threads** and have those replies automatically posted as comments on the corresponding Paperclip issue.

### How it works

1. The bot posts a notification (e.g., "✅ Done: FUR-141")
2. You reply in the **Slack thread** on that message
3. Slack sends the reply to your app's `/api/slack/events` endpoint
4. The endpoint extracts the issue identifier (FUR-141) from the parent message
5. Your reply is posted as a Paperclip comment on that issue
6. The CTO agent wakes up and sees your comment on the next heartbeat

### Setup: Enable Event Subscriptions

#### 1. Get your Signing Secret

1. Go to [api.slack.com/apps](https://api.slack.com/apps) > your app
2. Click **"Basic Information"** in the sidebar
3. Scroll to **"App Credentials"**
4. Copy the **"Signing Secret"**

#### 2. Set the SLACK_SIGNING_SECRET env var

```bash
# Vercel
vercel env add SLACK_SIGNING_SECRET
# Paste the signing secret
# Select: Production, Preview, Development

# Local
echo 'SLACK_SIGNING_SECRET=your-signing-secret' >> .env.local
```

#### 3. Deploy your app first

The Events API requires a live URL to verify. Deploy your app so `/api/slack/events` is accessible:

```bash
# Push to main (triggers Vercel deployment)
git push
```

Wait for the deployment to complete.

#### 4. Enable Event Subscriptions in Slack

1. Go to your Slack app settings > **"Event Subscriptions"**
2. Toggle **"Enable Events"** to **On**
3. In **"Request URL"**, enter: `https://your-app.vercel.app/api/slack/events`
   - Slack will send a verification challenge — the endpoint handles it automatically
   - You should see a green ✓ "Verified"
4. Under **"Subscribe to bot events"**, add:
   - `message.channels` — messages in public channels

5. Click **"Save Changes"**
6. If prompted, **reinstall the app** to your workspace

#### 5. Test it

1. Find a bot notification in your Slack channel (e.g., "✅ Done: FUR-141")
2. Reply **in the thread** (click the message > "Reply in thread")
3. Type a message like "Thanks, looks good!"
4. Check the Paperclip issue — your reply should appear as a comment

### Non-threaded (channel) messages

Top-level messages in the channel (not replies to a bot notification) are also captured. These are stored in the `slack_replies` table with `issue_identifier = 'GENERAL'` since they don't map to a specific Paperclip issue.

**How triage works:**

1. Non-threaded messages are stored with identifier `GENERAL`
2. The CTO agent calls `GET /api/slack/triage` during heartbeats to fetch unprocessed GENERAL messages
3. For each message, the agent creates a new Paperclip issue (triaged from Slack)
4. The agent calls `POST /api/slack/triage` with the processed message IDs to mark them done

**Triage API endpoints** (auth: `CRON_SECRET`):

```bash
# Fetch unprocessed GENERAL messages
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://your-app.vercel.app/api/slack/triage

# Mark messages as processed
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  https://your-app.vercel.app/api/slack/triage \
  -d '{"ids": [1, 2, 3]}'
```

### Acknowledgment behavior

When the bot receives a message, it provides immediate feedback:

- **👀 reaction** — added to every stored message (threaded and non-threaded) so you know it was received
- **Threaded reply** — for non-threaded (GENERAL) messages, the bot posts a brief reply: _"Got it — logged for triage. The CTO agent will pick this up on the next heartbeat."_

This requires the `reactions:write` bot scope (in addition to `chat:write`).

### Important notes

- **Thread replies** route to the specific Paperclip issue mentioned in the parent bot notification.
- **Non-threaded messages** are stored as `GENERAL` and triaged by the CTO agent into new Paperclip issues.
- **Issue identifier in message** — if a non-threaded message contains an issue identifier (e.g., FUR-141), it routes directly to that issue instead of GENERAL.
- **Bot messages ignored** — the bot's own messages are filtered out to prevent loops.
- **Comments appear as "Via Slack"** — thread replies are posted to Paperclip with a "Via Slack" prefix so the agent knows where the message came from.

---

## Environment Variables Summary

| Variable | Where to Set | Required | Purpose |
|----------|-------------|----------|---------|
| `SLACK_BOT_TOKEN` | Vercel, GitHub Actions, .env.local | Yes | Slack Bot OAuth token (`xoxb-...`) |
| `SLACK_CHANNEL_ID` | Vercel, GitHub Actions, .env.local | Yes | Target Slack channel ID (`C...`) |
| `CRON_SECRET` | Vercel, GitHub Actions, .env.local | Yes | Auth for /api/notify-blocked and /api/notify-complete endpoints |
| `SLACK_SIGNING_SECRET` | Vercel, .env.local | Yes (for two-way) | Verifies incoming Slack events (from App Credentials) |
| `SLACK_WEBHOOK_URL` | GitHub Actions | No | Legacy fallback (not needed if bot token is set) |

---

## Relevant Source Files

| File | Purpose |
|------|---------|
| `lib/slack.ts` | Core Slack messaging: `postSlackMessage()`, `notifyBlockedTask()`, `notifyTaskComplete()`, `notifyRecommendation()` |
| `lib/notify.ts` | Auto-apply notifications: `notifySlack()`, `notifyEmail()`, `notifyDiscord()`, `notifyPaperclip()` |
| `app/api/notify-blocked/route.ts` | API endpoint for blocked task alerts (auth via CRON_SECRET) |
| `app/api/notify-complete/route.ts` | API endpoint for task completion alerts (auth via CRON_SECRET) |
| `app/api/slack/events/route.ts` | Slack Events API webhook — routes thread replies to Paperclip comments |
| `app/api/slack/triage/route.ts` | Triage API — GET unprocessed GENERAL messages, POST to mark processed (auth: CRON_SECRET) |
| `scripts/notify-blocked.ts` | CLI script to send blocked-task notifications locally |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `channel_not_found` | Verify `SLACK_CHANNEL_ID` is correct (check channel details in Slack) |
| `not_in_channel` | Either invite the bot to the channel, or ensure bot has `chat:write.public` scope |
| `invalid_auth` | Regenerate the Bot OAuth Token and update all three locations |
| `missing_scope` | Add the required scope in Slack App settings > OAuth & Permissions, reinstall app |
| No messages appearing | Check Vercel runtime logs for `[slack]` errors; verify env vars with `vercel env ls` |
| GitHub Actions not notifying | Check `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID` are set as repo secrets |
| Thread replies not reaching Paperclip | Verify Event Subscriptions are enabled, Request URL shows ✓, and `SLACK_SIGNING_SECRET` is set on Vercel |
| "Invalid signature" in Vercel logs | `SLACK_SIGNING_SECRET` doesn't match — re-copy from App Credentials |

---

## For the CTO Agent (Paperclip)

The CTO agent should use `lib/slack.ts` functions to send notifications. The agent instructions (`AGENTS.md`) specify:

- **When completing a task:** Call `notifyTaskComplete()` (or `POST /api/notify-complete`) with the task identifier, title, and summary
- **When blocked:** Update the issue status to `blocked` AND call `notifyBlockedTask()` (or `POST /api/notify-blocked`)
- **When making recommendations:** Create a Paperclip issue AND call `notifyRecommendation()`
- **Idle behavior:** Research MCP/tool recommendations and post findings as a Paperclip issue + Slack notification

The agent does NOT need to handle Slack setup — that's a one-time human task described above.
