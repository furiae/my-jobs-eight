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
import { applyWorkday } from "./ats/workday";
import { applyGeneric } from "./ats/generic";
import { generateCoverLetter, deleteTempFile } from "./cover-letter";
import type { AtsPlatform, ApplicationRecord, PhaseTimeouts } from "./types";

const APPLY_TIMEOUT_MS = 120_000; // max time per application
const PHASE_TIMEOUTS: PhaseTimeouts = {
  pageLoadMs: 45_000,
  formFillMs: 30_000,
  submitMs: 30_000,
};
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 5_000; // 5s, 15s, 45s (×3 each retry)

/** Errors that are transient and worth retrying */
function isTransientError(reason: string): boolean {
  const transient = [
    "timeout_",
    "net::ERR_",
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENETUNREACH",
    "ERR_NETWORK",
    "Navigation timeout",
    "page.goto: Timeout",
    "Target closed",
    "Protocol error",
    "Session closed",
  ];
  return transient.some((t) => reason.includes(t));
}

/** Non-transient failures that should not be retried */
function isNonRetryable(reason: string): boolean {
  const permanent = [
    "captcha_detected",
    "no_submit_button",
    "no_form_found",
    "no_apply_link",
    "form_validation",
  ];
  return permanent.some((t) => reason.includes(t));
}

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
      if (coverLetter.isFallback) {
        console.log(`[apply] ${job.company} — using fallback cover letter (AI unavailable)`);
      }

      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });
      const page = await context.newPage();

      // Navigate to job page to find "Apply" link
      await page.goto(job.url, { waitUntil: "networkidle", timeout: PHASE_TIMEOUTS.pageLoadMs });

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

      // Apply with timeout + retry logic
      let result: import("./types").ApplyResult = { success: false, reason: "no_attempt" };

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const applyPage = await context.newPage();
        result = await Promise.race([
          dispatchApply(applyPage, applyUrl, platform, coverLetter.tempFilePath),
          timeout(APPLY_TIMEOUT_MS),
        ]);
        await applyPage.close().catch(() => {});

        if (result.success) break;

        // Don't retry non-transient failures
        if (result.reason && isNonRetryable(result.reason)) {
          console.log(`[apply] ${job.company} — non-retryable: ${result.reason}`);
          break;
        }

        // Only retry transient errors
        if (result.reason && !isTransientError(result.reason)) {
          console.log(`[apply] ${job.company} — unknown failure, not retrying: ${result.reason}`);
          break;
        }

        if (attempt < MAX_RETRIES) {
          const delayMs = BACKOFF_BASE_MS * Math.pow(3, attempt - 1);
          console.log(
            `[apply] ${job.company} — attempt ${attempt}/${MAX_RETRIES} failed (${result.reason}), retrying in ${delayMs / 1000}s...`
          );
          await sleep(delayMs);
        } else {
          console.log(
            `[apply] ${job.company} — attempt ${attempt}/${MAX_RETRIES} failed (${result.reason}), giving up`
          );
        }
      }

      if (result.success) {
        record.status = "applied";
        record.appliedAt = new Date();
        summary.applied++;
        await sql`UPDATE jobs SET applied_at = NOW() WHERE id = ${job.id}`;
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
  page: any,
  jobUrl: string
): Promise<string | null> {
  try {
    // Broad set of selectors for apply links/buttons
    const selectors = [
      'a[href*="apply"]',
      'a:has-text("Apply")',
      'a:has-text("Apply Now")',
      'a:has-text("Apply for this")',
      'a:has-text("Submit Application")',
      'button:has-text("Apply")',
      'button:has-text("Apply Now")',
      '.apply-button a',
      '.job-apply a',
      '[class*="apply"] a',
      '[data-action="apply"] a',
    ];

    for (const selector of selectors) {
      const el = page.locator(selector).first();
      if ((await el.count()) > 0) {
        const href = await el.getAttribute("href");
        if (href) {
          return href.startsWith("http") ? href : new URL(href, jobUrl).toString();
        }
        // It's a button — click it and capture navigation
        const [newPage] = await Promise.all([
          page.context().waitForEvent("page", { timeout: 5000 }).catch(() => null),
          el.click().catch(() => {}),
        ]);
        if (newPage) {
          const url = newPage.url();
          await newPage.close();
          return url;
        }
        // Same-page navigation after click
        await page.waitForTimeout(2000);
        const currentUrl = page.url();
        if (currentUrl !== jobUrl) {
          return currentUrl;
        }
      }
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
      return applyGreenhouse(page, url, coverLetterPath, PHASE_TIMEOUTS);
    case "lever":
      return applyLever(page, url, coverLetterPath, PHASE_TIMEOUTS);
    case "workday":
      return applyWorkday(page, url, coverLetterPath, PHASE_TIMEOUTS);
    default:
      return applyGeneric(page, url, coverLetterPath, PHASE_TIMEOUTS);
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
