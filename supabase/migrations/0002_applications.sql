-- Applications table — tracks auto-apply attempts for each job
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  job_url TEXT NOT NULL,
  job_title TEXT NOT NULL,
  company TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'failed', 'manual_required', 'skipped')),
  ats_platform TEXT,               -- greenhouse, lever, workday, generic, unknown
  apply_url TEXT,                  -- final URL where form was submitted
  error_message TEXT,              -- failure reason if status = failed
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS applications_job_id_idx ON applications (job_id);
CREATE INDEX IF NOT EXISTS applications_status_idx ON applications (status);
CREATE INDEX IF NOT EXISTS applications_applied_at_idx ON applications (applied_at DESC);
