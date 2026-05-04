import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function checkDatabase() {
  try {
    const jobsResult = await sql`SELECT COUNT(*) as count FROM jobs;`;
    console.log("Total jobs:", jobsResult[0].count);

    const applicationsResult = await sql`SELECT COUNT(*) as count FROM applications;`;
    console.log("Total applications:", applicationsResult[0].count);

    const unappliedResult = await sql`
      SELECT COUNT(*) as count FROM jobs j
      WHERE NOT EXISTS (
        SELECT 1 FROM applications a WHERE a.job_id = j.id
      )
    `;
    console.log("Unapplied jobs:", unappliedResult[0].count);

    // Get sample of unapplied jobs
    const sampleResult = await sql`
      SELECT j.id, j.title, j.company, j.url FROM jobs j
      WHERE NOT EXISTS (
        SELECT 1 FROM applications a WHERE a.job_id = j.id
      )
      LIMIT 5
    `;
    console.log("Sample unapplied jobs:");
    (sampleResult as any[]).forEach((job: any) => {
      console.log(`  - ${job.title} @ ${job.company}`);
    });
  } catch (e) {
    console.error("Error:", (e as Error).message);
  }
}

checkDatabase();
