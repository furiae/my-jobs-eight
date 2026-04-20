/**
 * Apply to a single job by URL — bypasses the engine's filter logic.
 * Usage: npx tsx scripts/apply-one.ts <greenhouse-url>
 */

import { chromium } from "playwright";
import { neon } from "@neondatabase/serverless";
import { applyGreenhouse } from "../lib/apply/ats/greenhouse";
import { generateCoverLetter, deleteTempFile } from "../lib/apply/cover-letter";
import { PROFILE } from "../lib/apply/profile";

const url = process.argv[2];
if (!url) {
  console.error("Usage: npx tsx scripts/apply-one.ts <apply-url>");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;

async function main() {
  console.log(`[apply-one] Applying to: ${url}`);

  // Generate cover letter
  let coverLetterPath: string | undefined;
  let coverLetterText: string | undefined;
  try {
    const cl = await generateCoverLetter(
      { title: "Design Role", company: "Company", description: "" },
      PROFILE
    );
    coverLetterPath = cl.tempFilePath;
    coverLetterText = cl.text;
    console.log(`[apply-one] Cover letter: ${cl.isFallback ? "fallback" : "AI-generated"}`);
  } catch (err) {
    console.log(`[apply-one] Cover letter generation failed: ${err}`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    const result = await applyGreenhouse(page, url, coverLetterPath, {
      pageLoadMs: 60_000,
      formFillMs: 45_000,
      submitMs: 45_000,
    });

    console.log(`[apply-one] Result:`, JSON.stringify(result, null, 2));

    // Record in DB if we have a connection
    if (databaseUrl) {
      const sql = neon(databaseUrl);
      try {
        // Find matching job_id from URL, or generate a UUID
        const matchingJob = await sql`SELECT id FROM jobs WHERE url = ${url} LIMIT 1`;
        const jobId = matchingJob.length > 0 ? matchingJob[0].id : crypto.randomUUID();
        await sql`
          INSERT INTO applications (job_id, job_url, job_title, company, status, ats_platform, apply_url, error_message, applied_at, cover_letter_text)
          VALUES (
            ${jobId}, ${url}, ${"Direct Apply"}, ${"Direct"}, ${result.success ? "applied" : "failed"},
            ${"greenhouse"}, ${result.finalUrl ?? url}, ${result.reason ?? null},
            ${result.success ? new Date().toISOString() : null}, ${coverLetterText ?? null}
          )
          ON CONFLICT (job_id) DO UPDATE SET
            status = EXCLUDED.status,
            apply_url = EXCLUDED.apply_url,
            error_message = EXCLUDED.error_message,
            applied_at = EXCLUDED.applied_at,
            cover_letter_text = EXCLUDED.cover_letter_text,
            updated_at = NOW()
        `;
        console.log("[apply-one] Recorded in applications table");
      } catch (dbErr) {
        console.log(`[apply-one] DB record failed: ${dbErr}`);
      }
    }
  } catch (err) {
    console.error(`[apply-one] Error: ${err}`);
  } finally {
    if (coverLetterPath) deleteTempFile(coverLetterPath);
    await context.close();
    await browser.close();
  }
}

main();
