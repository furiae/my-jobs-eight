/**
 * Auto-apply engine.
 *
 * Fetches un-applied jobs from the DB, filters by title/salary match,
 * then launches Playwright for each one to attempt application.
 * Results are written back to the `applications` table.
 */

import { chromium } from "playwright";
import { neon } from "@neondatabase/serverless";
import { titleMatches, salaryAboveFloor, PROFILE } from "./profile";
import { applyGreenhouse } from "./ats/greenhouse";
import { applyLever } from "./ats/lever";
import { applyGeneric } from "./ats/generic";
import { generateCoverLetter, deleteTempFile } from "./cover-letter";
import type { AtsPlatform, ApplicationRecord } from "./types";

const APPLY_TIMEOUT_MS = 60_000; // max time per application

export interface RunOptions {
  databaseUrl: string;
  limit?: number;        // max jobs to attempt per run (default 10)
  dryRun?: boolean;      // if true, only filter — don't open browser
}

export interface RunSummary {
  attempted: number;
  applied: number;
  failed: number;
  manual: number;
  skipped: number;
  records: ApplicationRecord[];
}

export async function runAutoApply(opts: RunOptions): Promise<RunSummary> {
  const sql = neon(opts.databaseUrl);
  const limit = opts.limit ?? 10;

  // 1. Fetch un-applied jobs
  const rows = await sql`
    SELECT j.id, j.url, j.title, j.company, j.salary, j.source, j.description
    FROM jobs j
    LEFT JOIN applications a ON a.job_id = j.id
    WHERE a.id IS NULL
    ORDER BY j.scraped_at DESC
    LIMIT ${limit * 5}
  `;

  // 2. Filter by title + salary
  const eligible = rows.filter(
    (r) => titleMatches(r.title) && salaryAboveFloor(r.salary)
  ).slice(0, limit);

  const summary: RunSummary = {
    attempted: eligible.length,
    applied: 0,
    failed: 0,
    manual: 0,
    skipped: 0,
    records: [],
  };

  if (eligible.length === 0 || opts.dryRun) {
    return summary;
  }

  const browser = await chromium.launch({ headless: true });

  for (const job of eligible) {
    const record: ApplicationRecord = {
      jobId: job.id,
      jobUrl: job.url,
      jobTitle: job.title,
      company: job.company,
      status: "pending",
    };

    try {
      // Generate AI-customized cover letter for this job
      const coverLetter = await generateCoverLetter(
        { title: job.title, company: job.company, description: job.description },
        PROFILE
      );
      record.coverLetterText = coverLetter.text;

      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });
      const page = await context.newPage();

      // Navigate to job page to find "Apply" link
      await page.goto(job.url, { waitUntil: "networkidle", timeout: 30000 });

      // Find apply link
      const applyUrl = await findApplyUrl(page, job.url);

      if (!applyUrl) {
        record.status = "manual_required";
        record.errorMessage = "no_apply_link";
        summary.manual++;
        await context.close();
        deleteTempFile(coverLetter.tempFilePath);
        await upsertApplication(sql, record);
        summary.records.push(record);
        continue;
      }

      record.applyUrl = applyUrl;

      // Detect ATS platform
      const platform = detectAts(applyUrl);
      record.atsPlatform = platform;

      // Apply with timeout
      const applyPage = await context.newPage();
      const result = await Promise.race([
        dispatchApply(applyPage, applyUrl, platform, coverLetter.tempFilePath),
        timeout(APPLY_TIMEOUT_MS),
      ]);

      if (result.success) {
        record.status = "applied";
        record.appliedAt = new Date();
        summary.applied++;
      } else if (
        result.reason === "captcha_detected" ||
        result.reason === "no_submit_button" ||
        result.reason === "no_form_found"
      ) {
        record.status = "manual_required";
        record.errorMessage = result.reason;
        summary.manual++;
      } else {
        record.status = "failed";
        record.errorMessage = result.reason;
        summary.failed++;
      }

      if (result.finalUrl) {
        record.applyUrl = result.finalUrl;
      }

      await context.close();
      deleteTempFile(coverLetter.tempFilePath);
    } catch (err) {
      record.status = "failed";
      record.errorMessage = String(err).slice(0, 500);
      summary.failed++;
    }

    await upsertApplication(sql, record);
    summary.records.push(record);

    // Polite delay between applications
    await sleep(2000);
  }

  await browser.close();
  return summary;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function findApplyUrl(
  page: { locator: Function; url: Function },
  jobUrl: string
): Promise<string | null> {
  try {
    // Look for explicit Apply button/link
    const applyLink = (page as any).locator(
      'a:has-text("Apply"), a[href*="apply"], button:has-text("Apply Now")'
    ).first();

    if (await applyLink.count() > 0) {
      const href = await applyLink.getAttribute("href");
      if (href) {
        return href.startsWith("http") ? href : new URL(href, jobUrl).toString();
      }
      // Button — try clicking and see where we end up
    }
    return null;
  } catch {
    return null;
  }
}

function detectAts(url: string): AtsPlatform {
  if (url.includes("greenhouse.io") || url.includes("boards.greenhouse")) return "greenhouse";
  if (url.includes("lever.co")) return "lever";
  if (url.includes("workday.com") || url.includes("myworkdayjobs.com")) return "workday";
  return "generic";
}

async function dispatchApply(
  page: any,
  url: string,
  platform: AtsPlatform,
  coverLetterPath: string
) {
  switch (platform) {
    case "greenhouse":
      return applyGreenhouse(page, url, coverLetterPath);
    case "lever":
      return applyLever(page, url, coverLetterPath);
    default:
      return applyGeneric(page, url, coverLetterPath);
  }
}

async function upsertApplication(sql: any, r: ApplicationRecord) {
  await sql`
    INSERT INTO applications (job_id, job_url, job_title, company, status, ats_platform, apply_url, error_message, applied_at, cover_letter_text)
    VALUES (
      ${r.jobId}, ${r.jobUrl}, ${r.jobTitle}, ${r.company},
      ${r.status}, ${r.atsPlatform ?? null}, ${r.applyUrl ?? null},
      ${r.errorMessage ?? null}, ${r.appliedAt ?? null},
      ${r.coverLetterText ?? null}
    )
    ON CONFLICT (job_id) DO UPDATE SET
      status = EXCLUDED.status,
      ats_platform = EXCLUDED.ats_platform,
      apply_url = EXCLUDED.apply_url,
      error_message = EXCLUDED.error_message,
      applied_at = EXCLUDED.applied_at,
      cover_letter_text = EXCLUDED.cover_letter_text,
      updated_at = NOW()
  `;
}

function timeout(ms: number) {
  return new Promise<import("./types").ApplyResult>((resolve) =>
    setTimeout(() => resolve({ success: false, reason: `timeout_${ms}ms` }), ms)
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
