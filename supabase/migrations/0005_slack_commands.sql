-- Stores Slack slash command requests for issue creation.
-- The Vercel endpoint writes here; the CTO agent reads and creates Paperclip issues during heartbeats.
CREATE TABLE IF NOT EXISTS slack_commands (
  id SERIAL PRIMARY KEY,
  command TEXT NOT NULL,                   -- e.g. /furiae
  command_text TEXT NOT NULL,              -- issue title / description text
  slack_user_id TEXT NOT NULL,             -- Slack user ID
  slack_user_name TEXT NOT NULL,           -- Slack display name
  slack_channel_id TEXT NOT NULL,          -- channel where command was invoked
  response_url TEXT,                       -- Slack response URL for deferred replies
  processed_at TIMESTAMPTZ DEFAULT NULL,   -- set when CTO creates the Paperclip issue
  paperclip_issue_id TEXT,                 -- Paperclip issue identifier once created
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_slack_commands_unprocessed ON slack_commands (processed_at) WHERE processed_at IS NULL;
