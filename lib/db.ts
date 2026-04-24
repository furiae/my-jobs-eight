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

export type SortField = "scraped_at" | "posted_at";
export type SortDir = "desc" | "asc";

export async function getJobs(
  limit = 50,
  offset = 0,
  source?: string,
  sortField: SortField = "scraped_at",
  sortDir: SortDir = "desc"
): Promise<{ jobs: Job[]; total: number }> {
  // sortField and sortDir are validated enum types — safe to interpolate as raw SQL.
  // Neon's sql tagged template doesn't support composable fragments (nested sql calls
  // are treated as parameter bindings, not inlined SQL), so we use the sql(string, params)
  // call signature instead.
  const nulls = sortField === "posted_at" ? " NULLS LAST" : "";
  const orderBy = `ORDER BY j.${sortField} ${sortDir.toUpperCase()}${nulls}`;

  const base = `
    SELECT j.*, a.status as application_status, a.ats_platform, a.error_message, a.cover_letter_text, a.apply_url
    FROM jobs j
    LEFT JOIN applications a ON a.job_id = j.id
  `;

  const rows = source
    ? await sql(`${base} WHERE j.source = $1 ${orderBy} LIMIT $2 OFFSET $3`, [source, limit, offset])
    : await sql(`${base} ${orderBy} LIMIT $1 OFFSET $2`, [limit, offset]);

  const countRows = source
    ? await sql("SELECT COUNT(*) as count FROM jobs WHERE source = $1", [source])
    : await sql("SELECT COUNT(*) as count FROM jobs");

  return {
    jobs: rows as Job[],
    total: Number(countRows[0].count),
  };
}

export async function getJobSources(): Promise<Array<{ source: string; count: number }>> {
  const rows = await sql`
    SELECT source, COUNT(*) as count
    FROM jobs
    GROUP BY source
    ORDER BY count DESC
  `;
  return rows.map((r) => ({ source: r.source as string, count: Number(r.count) }));
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

/** Fetch only unprocessed GENERAL (non-threaded) Slack messages for triage. */
export async function getUnprocessedGeneralReplies(): Promise<SlackReply[]> {
  const rows = await sql`
    SELECT id, issue_identifier, slack_user, reply_text, created_at
    FROM slack_replies
    WHERE processed_at IS NULL AND issue_identifier = 'GENERAL'
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

// ── Slack commands ──────────────────────────────────────────────────────────

export interface SlackCommand {
  id: number;
  command: string;
  command_text: string;
  slack_user_id: string;
  slack_user_name: string;
  slack_channel_id: string;
  response_url: string | null;
  created_at: string;
}

export async function insertSlackCommand(cmd: {
  command: string;
  commandText: string;
  slackUserId: string;
  slackUserName: string;
  slackChannelId: string;
  responseUrl: string | null;
}): Promise<number> {
  const rows = await sql`
    INSERT INTO slack_commands (command, command_text, slack_user_id, slack_user_name, slack_channel_id, response_url)
    VALUES (${cmd.command}, ${cmd.commandText}, ${cmd.slackUserId}, ${cmd.slackUserName}, ${cmd.slackChannelId}, ${cmd.responseUrl})
    RETURNING id
  `;
  return rows[0].id as number;
}

export async function getUnprocessedSlackCommands(): Promise<SlackCommand[]> {
  const rows = await sql`
    SELECT id, command, command_text, slack_user_id, slack_user_name, slack_channel_id, response_url, created_at
    FROM slack_commands
    WHERE processed_at IS NULL
    ORDER BY created_at ASC
  `;
  return rows as SlackCommand[];
}

export async function markSlackCommandProcessed(id: number, paperclipIssueId: string): Promise<void> {
  await sql`
    UPDATE slack_commands SET processed_at = NOW(), paperclip_issue_id = ${paperclipIssueId}
    WHERE id = ${id}
  `;
}
