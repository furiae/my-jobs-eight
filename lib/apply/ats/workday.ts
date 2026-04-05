import type { Page } from "playwright";
import { PROFILE } from "../profile";
import type { ApplyResult, PhaseTimeouts } from "../types";

const DEFAULT_TIMEOUTS: PhaseTimeouts = { pageLoadMs: 45_000, formFillMs: 30_000, submitMs: 30_000 };

// Workday ATS: myworkdayjobs.com or *.wd5.myworkdayjobs.com
// Workday forms are heavy SPAs with custom input components.
export async function applyWorkday(
  page: Page,
  applyUrl: string,
  coverLetterPath?: string,
  timeouts: PhaseTimeouts = DEFAULT_TIMEOUTS
): Promise<ApplyResult> {
  try {
    await page.goto(applyUrl, { waitUntil: "networkidle", timeout: timeouts.pageLoadMs });
  } catch (err) {
    console.log(`[apply:workday] page_load phase timed out after ${timeouts.pageLoadMs}ms`);
    return { success: false, reason: `timeout_page_load_${timeouts.pageLoadMs}ms` };
  }

  const isWorkday =
    page.url().includes("workday.com") ||
    page.url().includes("myworkdayjobs.com");

  if (!isWorkday) {
    return { success: false, reason: "not_workday" };
  }

  try {
    // ── Form fill phase ──
    const fillResult = await Promise.race([
      (async () => {
        // Workday often requires clicking "Apply" to open the application form
        const applyBtn = page.locator('a:has-text("Apply"), button:has-text("Apply")').first();
        if ((await applyBtn.count()) > 0) {
          await applyBtn.click();
          await page.waitForTimeout(3000);
        }

        // Workday uses "Create Account" or "Sign In" — look for manual apply option
        const manualApply = page.locator(
          'a:has-text("Apply Manually"), button:has-text("Apply Manually"), a:has-text("without account")'
        ).first();
        if ((await manualApply.count()) > 0) {
          await manualApply.click();
          await page.waitForTimeout(3000);
        }

        // Fill common Workday fields using data-automation-id attributes
        await fillWorkdayField(page, 'input[data-automation-id="legalNameSection_firstName"], input[aria-label*="First Name" i]', PROFILE.firstName);
        await fillWorkdayField(page, 'input[data-automation-id="legalNameSection_lastName"], input[aria-label*="Last Name" i]', PROFILE.lastName);
        await fillWorkdayField(page, 'input[data-automation-id="email"], input[aria-label*="Email" i]', PROFILE.email);
        await fillWorkdayField(page, 'input[data-automation-id="phone-number"], input[aria-label*="Phone" i]', PROFILE.phone);
        await fillWorkdayField(page, 'input[aria-label*="LinkedIn" i]', PROFILE.linkedin);
        await fillWorkdayField(page, 'input[aria-label*="Website" i], input[aria-label*="Portfolio" i]', PROFILE.portfolio);
        await fillWorkdayField(page, 'input[aria-label*="City" i]', PROFILE.city);
        await fillWorkdayField(page, 'input[aria-label*="Postal" i], input[aria-label*="Zip" i]', PROFILE.zip);

        // Resume upload
        const resumeInput = page.locator('input[type="file"][data-automation-id*="resume"], input[type="file"]').first();
        if ((await resumeInput.count()) > 0) {
          await resumeInput.setInputFiles(PROFILE.resumePath);
          await page.waitForTimeout(2000);
        }

        // Cover letter upload
        if (coverLetterPath) {
          const coverInput = page.locator('input[type="file"][data-automation-id*="cover"]');
          if ((await coverInput.count()) > 0) {
            await coverInput.first().setInputFiles(coverLetterPath);
          }
        }

        return { filled: true } as const;
      })(),
      new Promise<{ filled: false }>((resolve) =>
        setTimeout(() => resolve({ filled: false }), timeouts.formFillMs)
      ),
    ]);

    if (!fillResult.filled) {
      console.log(`[apply:workday] form_fill phase timed out after ${timeouts.formFillMs}ms`);
      return { success: false, reason: `timeout_form_fill_${timeouts.formFillMs}ms` };
    }

    // ── Submit phase ──
    const submitBtn = page.locator(
      'button[data-automation-id="bottom-navigation-next-button"], button:has-text("Submit"), button:has-text("Apply")'
    ).first();

    if ((await submitBtn.count()) === 0) {
      return { success: false, reason: "no_submit_button" };
    }

    const submitResult = await Promise.race([
      (async () => {
        await submitBtn.click();
        await page.waitForTimeout(4000);

        const success =
          (await page.locator("text=/thank you|application received|submitted|successfully/i").count()) > 0 ||
          page.url().includes("confirmation") ||
          page.url().includes("thank");

        return { done: true, success } as const;
      })(),
      new Promise<{ done: false }>((resolve) =>
        setTimeout(() => resolve({ done: false }), timeouts.submitMs)
      ),
    ]);

    if (!submitResult.done) {
      console.log(`[apply:workday] submit phase timed out after ${timeouts.submitMs}ms`);
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

async function fillWorkdayField(page: Page, selector: string, value: string) {
  try {
    const el = page.locator(selector).first();
    if ((await el.count()) > 0) {
      await el.fill(value);
    }
  } catch {
    // skip
  }
}
