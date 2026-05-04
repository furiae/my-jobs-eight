import { neon } from "@neondatabase/serverless";
import { titleMatches, salaryAboveFloor } from "../lib/apply/profile";

const sql = neon(process.env.DATABASE_URL!);

async function checkFilters() {
  try {
    const unappliedResult = await sql`
      SELECT j.id, j.title, j.company, j.salary FROM jobs j
      WHERE NOT EXISTS (
        SELECT 1 FROM applications a WHERE a.job_id = j.id
      )
      LIMIT 100
    `;
    
    const matches = (unappliedResult as any[]).filter(
      (job) => titleMatches(job.title) && salaryAboveFloor(job.salary)
    );

    console.log(`Out of 100 unapplied jobs:`);
    console.log(`- Title matches: ${matches.length}`);
    console.log("\nMatching jobs:");
    matches.slice(0, 10).forEach((job: any) => {
      console.log(`  - ${job.title} @ ${job.company}`);
    });

    if (matches.length === 0) {
      console.log("\nNo matches found. Sample of jobs that were filtered out:");
      (unappliedResult as any[]).slice(0, 10).forEach((job: any) => {
        const title = titleMatches(job.title);
        const salary = salaryAboveFloor(job.salary);
        console.log(`  - "${job.title}" [title: ${title}, salary: ${salary}]`);
      });
    }
  } catch (e) {
    console.error("Error:", (e as Error).message);
  }
}

checkFilters();
