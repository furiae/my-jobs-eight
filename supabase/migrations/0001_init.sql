-- Jobs table — stores scraped remote design jobs
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  salary TEXT,
  location TEXT NOT NULL DEFAULT 'Remote',
  description TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  posted_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jobs_source_idx ON jobs (source);
CREATE INDEX IF NOT EXISTS jobs_scraped_at_idx ON jobs (scraped_at DESC);
CREATE INDEX IF NOT EXISTS jobs_posted_at_idx ON jobs (posted_at DESC);
