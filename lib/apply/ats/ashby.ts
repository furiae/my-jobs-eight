import type { Page } from "playwright";
import { PROFILE } from "../profile";
import type { ApplyResult, PhaseTimeouts } from "../types";
import { detectSubmitSuccess } from "./detect-success";

const DEFAULT_TIMEOUTS: PhaseTimeouts = { pageLoadMs: 45_000, formFillMs: 30_000, submitMs: 30_000 };

// Ashby HQ ATS: jobs.ashbyhq.com/<company>/<id>
export async function applyAshby(
  page: Page,
  applyUrl: string,
  coverLetterPath?: string,
  timeouts: PhaseTimeouts = DEFAULT_TIMEOUTS
): Promise<ApplyResult> {
  try {
    await page.goto(applyUrl, { waitUntil: "networkidle", timeout: timeouts.pageLoadMs });
  } catch (err) {
    console.log(`[apply:ashby] page_load phase timed out after ${timeouts.pageLoadMs}ms`);
    return { success: false, reason: `timeout_page_load_${timeouts.pageLoadMs}ms` };
  }

  // Detect Ashby form
  const isAshby =
    page.url().includes("ashbyhq.com") ||
    (await page.locator('[data-testid="application-form"], form[action*="ashby"]').count()) > 0;

  if (!isAshby) {
    return { success: false, reason: "not_ashby" };
  }

  try {
    // ── Form fill phase ──
    const fillResult = await Promise.race([
      (async () => {
        // Ashby uses labeled input fields — try both name-based and label-based selectors
        // Name fields (Ashby often uses a single "Name" or separate first/last)
        const nameInput = page.locator('input[name="name"], input[name="_systemfield_name"]');
        if ((await nameInput.count()) > 0) {
          await nameInput.first().fill(PROFILE.fullName);
        } else {
          await fillIfExists(page, 'input[name="firstName"], input[name="_systemfield_first_name"]', PROFILE.firstName);
          await fillIfExists(page, 'input[name="lastName"], input[name="_systemfield_last_name"]', PROFILE.lastName);
        }

        // Email
        await fillIfExists(page, 'input[name="email"], input[name="_systemfield_email"], input[type="email"]', PROFILE.email);

        // Phone
        await fillIfExists(page, 'input[name="phone"], input[name="_systemfield_phone"], input[type="tel"]', PROFILE.phone);

        // LinkedIn
        await fillIfExists(
          page,
          'input[name*="linkedin" i], input[name="linkedInUrl"], input[name="_systemfield_linkedin"]',
          PROFILE.linkedin
        );

        // Website / Portfolio
        await fillIfExists(
          page,
          'input[name*="portfolio" i], input[name*="website" i], input[name="websiteUrl"], input[name="_systemfield_website"]',
          PROFILE.portfolio
        );

        // Location / Current location
        await fillIfExists(
          page,
          'input[name*="location" i], input[name="currentLocation"], input[name="_systemfield_location"]',
          `${PROFILE.city}, ${PROFILE.state}`
        );

        // Resume upload — Ashby uses standard file input or drag-drop zone
        const resumeInput = page.locator(
          'input[type="file"][name*="resume" i], input[type="file"][data-testid*="resume" i], input[type="file"]'
        );
        if ((await resumeInput.count()) > 0) {
          await resumeInput.first().setInputFiles(PROFILE.resumePath);
          await page.waitForTimeout(1500); // wait for upload processing
        }

        // Cover letter upload
        const coverInput = page.locator(
          'input[type="file"][name*="cover" i], input[type="file"][data-testid*="cover" i]'
        );
        if ((await coverInput.count()) > 0) {
          await coverInput.first().setInputFiles(coverLetterPath ?? PROFILE.coverLetterPath);
        }

        // Cover letter textarea
        const coverTextarea = page.locator('textarea[name*="cover" i], textarea[data-testid*="cover" i]');
        if ((await coverTextarea.count()) > 0 && coverLetterPath) {
          const { readFileSync } = await import("fs");
          const text = readFileSync(coverLetterPath, "utf-8");
          await coverTextarea.first().fill(text);
        }

        // Work authorization (Ashby uses select or radio)
        const authSelect = page.locator('select[name*="authorized" i], select[name*="authorization" i]');
        if ((await authSelect.count()) > 0) {
          await authSelect.first().selectOption({ label: "Yes" });
        }

        // Sponsorship
        const sponsorSelect = page.locator('select[name*="sponsor" i]');
        if ((await sponsorSelect.count()) > 0) {
          await sponsorSelect.first().selectOption({ label: "No" });
        }

        return { filled: true } as const;
      })(),
      new Promise<{ filled: false }>((resolve) =>
        setTimeout(() => resolve({ filled: false }), timeouts.formFillMs)
      ),
    ]);

    if (!fillResult.filled) {
      console.log(`[apply:ashby] form_fill phase timed out after ${timeouts.formFillMs}ms`);
      return { success: false, reason: `timeout_form_fill_${timeouts.formFillMs}ms` };
    }

    // ── Submit phase ──
    const submitBtnSelector = 'button[type="submit"], button[data-testid="submit-application"]';
    const submitBtn = page.locator(submitBtnSelector).filter({ hasText: /submit|apply/i });

    if ((await submitBtn.count()) === 0) {
      return { success: false, reason: "no_submit_button" };
    }

    const submitResult = await Promise.race([
      (async () => {
        const preSubmitUrl = page.url();
        const btnText = await submitBtn.first().textContent().catch(() => "");

        await submitBtn.first().click();

        const detection = await detectSubmitSuccess(page, {
          preSubmitUrl,
          submitButtonSelector: submitBtnSelector,
          submitButtonText: btnText ?? undefined,
          formSelector: '[data-testid="application-form"], form[action*="ashby"]',
          spaWaitMs: 5000,
        });

        return { done: true, success: detection.success, signal: detection.signal } as const;
      })(),
      new Promise<{ done: false; success: false; signal?: string }>((resolve) =>
        setTimeout(() => resolve({ done: false, success: false }), timeouts.submitMs)
      ),
    ]);

    if (!submitResult.done) {
      console.log(`[apply:ashby] submit phase timed out after ${timeouts.submitMs}ms`);
      return { success: false, reason: `timeout_submit_${timeouts.submitMs}ms` };
    }

    if (submitResult.signal) {
      console.log(`[apply:ashby] success detection signal: ${submitResult.signal}`);
    }

    return {
      success: submitResult.success,
      reason: submitResult.success ? undefined : submitResult.signal ?? "submit_unclear",
      finalUrl: page.url(),
    };
  } catch (err) {
    return { success: false, reason: String(err) };
  }
}

async function fillIfExists(page: Page, selector: string, value: string) {
  try {
    const el = page.locator(selector).first();
    if ((await el.count()) > 0) {
      await el.fill(value);
    }
  } catch {
    // Field not found — skip
  }
}
