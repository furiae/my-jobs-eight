import type { Page } from "playwright";
import { PROFILE } from "../profile";
import type { ApplyResult, PhaseTimeouts } from "../types";

const DEFAULT_TIMEOUTS: PhaseTimeouts = { pageLoadMs: 45_000, formFillMs: 30_000, submitMs: 30_000 };

// Greenhouse ATS: boards.greenhouse.io or /jobs/greenhouse/<job>
export async function applyGreenhouse(
  page: Page,
  applyUrl: string,
  coverLetterPath?: string,
  timeouts: PhaseTimeouts = DEFAULT_TIMEOUTS
): Promise<ApplyResult> {
  try {
    await page.goto(applyUrl, { waitUntil: "networkidle", timeout: timeouts.pageLoadMs });
  } catch (err) {
    console.log(`[apply:greenhouse] page_load phase timed out after ${timeouts.pageLoadMs}ms`);
    return { success: false, reason: `timeout_page_load_${timeouts.pageLoadMs}ms` };
  }

  // Detect Greenhouse form
  const isGreenhouse =
    (await page.locator("#application_form, form#application").count()) > 0 ||
    page.url().includes("greenhouse.io") ||
    page.url().includes("boards.greenhouse");

  if (!isGreenhouse) {
    return { success: false, reason: "not_greenhouse" };
  }

  try {
    // ── Form fill phase ──
    const fillResult = await Promise.race([
      (async () => {
        // First name
        await fillIfExists(page, 'input[name="first_name"], #first_name', PROFILE.firstName);
        // Last name
        await fillIfExists(page, 'input[name="last_name"], #last_name', PROFILE.lastName);
        // Email
        await fillIfExists(page, 'input[name="email"], #email', PROFILE.email);
        // Phone
        await fillIfExists(page, 'input[name="phone"], #phone', PROFILE.phone);
        // LinkedIn
        await fillIfExists(page, 'input[name*="linkedin"], input[id*="linkedin"]', PROFILE.linkedin);
        // Website / Portfolio
        await fillIfExists(
          page,
          'input[name*="website"], input[name*="portfolio"], input[id*="website"]',
          PROFILE.portfolio
        );

        // Resume upload
        const resumeInput = page.locator(
          'input[type="file"][name*="resume"], input[type="file"][id*="resume"]'
        );
        if ((await resumeInput.count()) > 0) {
          await resumeInput.first().setInputFiles(PROFILE.resumePath);
        }

        // Cover letter upload (prefer AI-generated temp file, fall back to static PDF)
        const coverInput = page.locator(
          'input[type="file"][name*="cover"], input[type="file"][id*="cover"]'
        );
        if ((await coverInput.count()) > 0) {
          await coverInput.first().setInputFiles(coverLetterPath ?? PROFILE.coverLetterPath);
        }

        // Cover letter text area (some ATS render a textarea instead of file upload)
        const coverTextarea = page.locator(
          'textarea[name*="cover"], textarea[id*="cover"]'
        );
        if ((await coverTextarea.count()) > 0 && coverLetterPath) {
          const { readFileSync } = await import("fs");
          const text = readFileSync(coverLetterPath, "utf-8");
          await coverTextarea.first().fill(text);
        }

        // Location / city
        await fillIfExists(page, 'input[name*="location"], input[id*="location"]', `${PROFILE.city}, ${PROFILE.state}`);

        // Work authorization dropdowns / checkboxes (common in Greenhouse)
        const authSelect = page.locator(
          'select[name*="authorized"], select[id*="authorized"]'
        );
        if ((await authSelect.count()) > 0) {
          await authSelect.first().selectOption({ label: "Yes" });
        }

        // Sponsorship dropdowns
        const sponsorSelect = page.locator(
          'select[name*="sponsor"], select[id*="sponsor"]'
        );
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
      console.log(`[apply:greenhouse] form_fill phase timed out after ${timeouts.formFillMs}ms`);
      return { success: false, reason: `timeout_form_fill_${timeouts.formFillMs}ms` };
    }

    // ── Submit phase ──
    const submitBtn = page.locator(
      'input[type="submit"], button[type="submit"]'
    ).filter({ hasText: /submit|apply/i });

    if ((await submitBtn.count()) === 0) {
      return { success: false, reason: "no_submit_button" };
    }

    const submitResult = await Promise.race([
      (async () => {
        await submitBtn.first().click();
        await page.waitForTimeout(3000);

        const success =
          (await page.locator("text=/thank you|application received|submitted/i").count()) > 0 ||
          page.url().includes("confirmation") ||
          page.url().includes("thank");

        return { done: true, success } as const;
      })(),
      new Promise<{ done: false }>((resolve) =>
        setTimeout(() => resolve({ done: false }), timeouts.submitMs)
      ),
    ]);

    if (!submitResult.done) {
      console.log(`[apply:greenhouse] submit phase timed out after ${timeouts.submitMs}ms`);
      return { success: false, reason: `timeout_submit_${timeouts.submitMs}ms` };
    }

    return {
      success: submitResult.success,
      reason: submitResult.success ? undefined : "submit_unclear",
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
