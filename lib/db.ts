import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

export interface Job {
  id: string;
  url: string;
  title: string;
  company: string;
  salary: string | null;
  location: string;
  description: string;
  source: string;
  posted_at: string | null;
  scraped_at: string;
  applied_at: string | null;
  application_status: string | null;
  ats_platform: string | null;
  error_message: string | null;
  cover_letter_text: string | null;
  apply_url: string | null;
}

export async function getJobs(
  limit = 50,
  offset = 0,
  source?: string
): Promise<{ jobs: Job[]; total: number }> {
  const rows = source
    ? await sql`
        SELECT j.*, a.status as application_status, a.ats_platform, a.error_message, a.cover_letter_text, a.apply_url
        FROM jobs j
        LEFT JOIN applications a ON a.job_id = j.id
        WHERE j.source = ${source}
        ORDER BY j.scraped_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    : await sql`
        SELECT j.*, a.status as application_status, a.ats_platform, a.error_message, a.cover_letter_text, a.apply_url
        FROM jobs j
        LEFT JOIN applications a ON a.job_id = j.id
        ORDER BY j.scraped_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

  const countRows = source
    ? await sql`SELECT COUNT(*) as count FROM jobs WHERE source = ${source}`
    : await sql`SELECT COUNT(*) as count FROM jobs`;

  return {
    jobs: rows as Job[],
    total: Number(countRows[0].count),
  };
}

export async function upsertJobs(jobs: Omit<Job, "id" | "scraped_at" | "applied_at" | "application_status" | "ats_platform" | "error_message" | "cover_letter_text" | "apply_url">[]) {
  if (jobs.length === 0) return 0;

  let inserted = 0;
  for (const job of jobs) {
    await sql`
      INSERT INTO jobs (url, title, company, salary, location, description, source, posted_at)
      VALUES (${job.url}, ${job.title}, ${job.company}, ${job.salary}, ${job.location}, ${job.description}, ${job.source}, ${job.posted_at})
      ON CONFLICT (url) DO UPDATE SET
        title = EXCLUDED.title,
        company = EXCLUDED.company,
        salary = EXCLUDED.salary,
        location = EXCLUDED.location,
        description = EXCLUDED.description,
        scraped_at = NOW()
    `;
    inserted++;
  }
  return inserted;
}

export async function markJobApplied(jobId: string): Promise<Job | null> {
  const rows = await sql`
    UPDATE jobs SET applied_at = NOW()
    WHERE id = ${jobId} AND applied_at IS NULL
    RETURNING *
  `;
  return (rows[0] as Job) ?? null;
}

export async function unmarkJobApplied(jobId: string): Promise<Job | null> {
  const rows = await sql`
    UPDATE jobs SET applied_at = NULL
    WHERE id = ${jobId}
    RETURNING *
  `;
  return (rows[0] as Job) ?? null;
}

// ── Slack replies ────────────────────────────────────────────────────────────

export interface SlackReply {
  id: number;
  issue_identifier: string;
  slack_user: string;
  reply_text: string;
  created_at: string;
}

export async function getUnprocessedSlackReplies(): Promise<SlackReply[]> {
  const rows = await sql`
    SELECT id, issue_identifier, slack_user, reply_text, created_at
    FROM slack_replies
    WHERE processed_at IS NULL
    ORDER BY created_at ASC
  `;
  return rows as SlackReply[];
}

export async function markSlackRepliesProcessed(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await sql`
    UPDATE slack_replies SET processed_at = NOW()
    WHERE id = ANY(${ids})
  `;
}
