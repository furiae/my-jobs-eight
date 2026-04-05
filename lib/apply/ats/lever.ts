import type { Page } from "playwright";
import { PROFILE } from "../profile";
import type { ApplyResult, PhaseTimeouts } from "../types";
import { detectSubmitSuccess } from "./detect-success";

const DEFAULT_TIMEOUTS: PhaseTimeouts = { pageLoadMs: 45_000, formFillMs: 30_000, submitMs: 30_000 };

// Lever ATS: jobs.lever.co/<company>/<id>
export async function applyLever(
  page: Page,
  applyUrl: string,
  coverLetterPath?: string,
  timeouts: PhaseTimeouts = DEFAULT_TIMEOUTS
): Promise<ApplyResult> {
  try {
    await page.goto(applyUrl, { waitUntil: "networkidle", timeout: timeouts.pageLoadMs });
  } catch (err) {
    console.log(`[apply:lever] page_load phase timed out after ${timeouts.pageLoadMs}ms`);
    return { success: false, reason: `timeout_page_load_${timeouts.pageLoadMs}ms` };
  }

  const isLever =
    page.url().includes("lever.co") ||
    (await page.locator(".lever-apply-form, #application-form").count()) > 0;

  if (!isLever) {
    return { success: false, reason: "not_lever" };
  }

  try {
    // ── Form fill phase ──
    const fillResult = await Promise.race([
      (async () => {
        await fillIfExists(page, 'input[name="name"]', PROFILE.fullName);
        await fillIfExists(page, 'input[name="email"]', PROFILE.email);
        await fillIfExists(page, 'input[name="phone"]', PROFILE.phone);
        await fillIfExists(page, 'input[name="org"]', ""); // current company — leave blank
        await fillIfExists(page, 'input[name="urls[LinkedIn]"]', PROFILE.linkedin);
        await fillIfExists(page, 'input[name="urls[Portfolio]"]', PROFILE.portfolio);
        await fillIfExists(page, 'input[name="urls[GitHub]"]', PROFILE.github);

        // Resume
        const resumeInput = page.locator('input[type="file"]').first();
        if ((await resumeInput.count()) > 0) {
          await resumeInput.setInputFiles(PROFILE.resumePath);
          await page.waitForTimeout(1500);
        }

        // Cover letter textarea (Lever exposes a textarea, not a file upload)
        if (coverLetterPath) {
          const coverTextarea = page.locator('textarea[name*="cover"], textarea[placeholder*="cover" i]');
          if ((await coverTextarea.count()) > 0) {
            const { readFileSync } = await import("fs");
            await coverTextarea.first().fill(readFileSync(coverLetterPath, "utf-8"));
          }
        }

        // Work auth checkboxes (Lever uses custom EEO section)
        const authCheckboxes = page.locator(
          'input[type="radio"][value*="yes" i], input[type="radio"][value*="authorized" i]'
        );
        if ((await authCheckboxes.count()) > 0) {
          await authCheckboxes.first().check();
        }

        return { filled: true } as const;
      })(),
      new Promise<{ filled: false }>((resolve) =>
        setTimeout(() => resolve({ filled: false }), timeouts.formFillMs)
      ),
    ]);

    if (!fillResult.filled) {
      console.log(`[apply:lever] form_fill phase timed out after ${timeouts.formFillMs}ms`);
      return { success: false, reason: `timeout_form_fill_${timeouts.formFillMs}ms` };
    }

    // ── Submit phase ──
    const submitBtnSelector = 'button[type="submit"], .btn-primary';
    const submitBtn = page.locator(submitBtnSelector).filter({
      hasText: /submit|apply/i,
    });
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
          formSelector: ".lever-apply-form, #application-form",
          spaWaitMs: 5000,
        });

        return { done: true, success: detection.success, signal: detection.signal } as const;
      })(),
      new Promise<{ done: false; success: false; signal?: string }>((resolve) =>
        setTimeout(() => resolve({ done: false, success: false }), timeouts.submitMs)
      ),
    ]);

    if (!submitResult.done) {
      console.log(`[apply:lever] submit phase timed out after ${timeouts.submitMs}ms`);
      return { success: false, reason: `timeout_submit_${timeouts.submitMs}ms` };
    }

    if (submitResult.signal) {
      console.log(`[apply:lever] success detection signal: ${submitResult.signal}`);
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
    // skip
  }
}
