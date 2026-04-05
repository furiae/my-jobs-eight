-- Add applied_at column to track when a user applied to a job
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS jobs_applied_at_idx ON jobs (applied_at DESC) WHERE applied_at IS NOT NULL;
