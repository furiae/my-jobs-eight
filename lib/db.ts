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
}

export async function getJobs(
  limit = 50,
  offset = 0,
  source?: string
): Promise<{ jobs: Job[]; total: number }> {
  const rows = source
    ? await sql`
        SELECT * FROM jobs
        WHERE source = ${source}
        ORDER BY scraped_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    : await sql`
        SELECT * FROM jobs
        ORDER BY scraped_at DESC
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

export async function upsertJobs(jobs: Omit<Job, "id" | "scraped_at">[]) {
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
