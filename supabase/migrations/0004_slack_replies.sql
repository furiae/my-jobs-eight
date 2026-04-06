-- Stores Slack thread replies for routing back to Paperclip.
-- The Vercel endpoint writes here; the CTO agent reads and posts to Paperclip during heartbeats.
CREATE TABLE IF NOT EXISTS slack_replies (
  id SERIAL PRIMARY KEY,
  issue_identifier TEXT NOT NULL,        -- e.g. FUR-141
  slack_user TEXT NOT NULL,              -- Slack user ID
  reply_text TEXT NOT NULL,              -- message content
  slack_channel TEXT,                    -- channel ID
  slack_thread_ts TEXT,                  -- parent message timestamp
  slack_message_ts TEXT,                 -- reply timestamp
  processed_at TIMESTAMPTZ DEFAULT NULL, -- set when routed to Paperclip
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_slack_replies_unprocessed ON slack_replies (processed_at) WHERE processed_at IS NULL;
