import type { Page } from "playwright";

export interface SuccessDetectionResult {
  success: boolean;
  signal?: string; // which signal triggered the detection
}

/**
 * Comprehensive post-submit success detection.
 * Checks multiple signals beyond simple text matching:
 * - Confirmation text patterns
 * - URL changes (confirmation/thank-you pages)
 * - Form becoming hidden or removed from DOM
 * - Submit button becoming disabled or changing text
 * - Success modals/overlays appearing
 * - Page navigation (SPA client-side routing)
 *
 * Also checks for error indicators to avoid false positives.
 */
export async function detectSubmitSuccess(
  page: Page,
  opts: {
    /** URL before clicking submit — used to detect navigation */
    preSubmitUrl?: string;
    /** Submit button locator — used to detect state changes */
    submitButtonSelector?: string;
    /** Original submit button text — used to detect text changes */
    submitButtonText?: string;
    /** Form selector — used to detect form removal/hiding */
    formSelector?: string;
    /** Extra wait time for SPA transitions (ms). Default 5000 */
    spaWaitMs?: number;
  } = {}
): Promise<SuccessDetectionResult> {
  const spaWaitMs = opts.spaWaitMs ?? 5000;

  // Wait for potential SPA transitions / redirects
  await page.waitForTimeout(spaWaitMs);

  // ── Check for error indicators first (avoid false positives) ──
  const errorSignals = await detectErrors(page);
  if (errorSignals) {
    return { success: false, signal: errorSignals };
  }

  // ── 1. Confirmation text patterns ──
  const confirmationText = await page
    .locator(
      "text=/thank you|thanks for (applying|your application)|application (received|submitted|complete)|successfully (submitted|applied)|we('ve| have) received your application|your application has been/i"
    )
    .count();
  if (confirmationText > 0) {
    return { success: true, signal: "confirmation_text" };
  }

  // ── 2. URL-based detection ──
  const url = page.url().toLowerCase();
  const urlKeywords = ["confirmation", "thank", "success", "applied", "complete", "submitted"];
  for (const kw of urlKeywords) {
    if (url.includes(kw)) {
      return { success: true, signal: `url_contains_${kw}` };
    }
  }

  // ── 3. Page navigated away (SPA routing) ──
  if (opts.preSubmitUrl && page.url() !== opts.preSubmitUrl) {
    // Navigated somewhere — could be success or error page.
    // If no error signals detected above, lean toward success.
    return { success: true, signal: "page_navigated" };
  }

  // ── 4. Form removed or hidden ──
  if (opts.formSelector) {
    const formVisible = await page.locator(opts.formSelector).isVisible().catch(() => false);
    const formCount = await page.locator(opts.formSelector).count();
    if (formCount === 0 || !formVisible) {
      return { success: true, signal: "form_removed_or_hidden" };
    }
  }

  // ── 5. Submit button state changed ──
  if (opts.submitButtonSelector) {
    const btn = page.locator(opts.submitButtonSelector).first();
    if ((await btn.count()) > 0) {
      const isDisabled = await btn.isDisabled().catch(() => false);
      if (isDisabled) {
        return { success: true, signal: "submit_button_disabled" };
      }

      // Check if button text changed (e.g. "Submit" → "Submitted!")
      if (opts.submitButtonText) {
        const currentText = await btn.textContent().catch(() => "");
        if (
          currentText &&
          currentText.trim().toLowerCase() !== opts.submitButtonText.trim().toLowerCase() &&
          /submitted|done|complete|sent|received/i.test(currentText)
        ) {
          return { success: true, signal: "submit_button_text_changed" };
        }
      }
    } else {
      // Button no longer in DOM — likely form was replaced with confirmation
      return { success: true, signal: "submit_button_removed" };
    }
  }

  // ── 6. Success modal / overlay ──
  const modalSuccess = await page
    .locator(
      '[role="dialog"] :text-matches("thank|success|submitted|received", "i"), ' +
        '.modal :text-matches("thank|success|submitted|received", "i"), ' +
        '[class*="modal"] :text-matches("thank|success|submitted|received", "i"), ' +
        '[class*="overlay"] :text-matches("thank|success|submitted|received", "i")'
    )
    .count();
  if (modalSuccess > 0) {
    return { success: true, signal: "modal_confirmation" };
  }

  // ── 7. Success alert / toast ──
  const alertSuccess = await page
    .locator(
      '[role="alert"] :text-matches("thank|success|submitted|received", "i"), ' +
        '[class*="toast"] :text-matches("thank|success|submitted|received", "i"), ' +
        '[class*="alert"] :text-matches("thank|success|submitted|received", "i")'
    )
    .count();
  if (alertSuccess > 0) {
    return { success: true, signal: "alert_confirmation" };
  }

  return { success: false, signal: "no_success_signal" };
}

async function detectErrors(page: Page): Promise<string | null> {
  // Check for visible form validation errors
  const errorPatterns = [
    '[class*="error"]:visible',
    '[class*="invalid"]:visible',
    '[role="alert"][class*="error"]',
    '.field-error:visible',
    '.form-error:visible',
    '[data-error]:visible',
  ];

  for (const selector of errorPatterns) {
    try {
      const count = await page.locator(selector).count();
      if (count > 0) {
        // Verify it's actually a form error, not a generic page element
        const text = await page.locator(selector).first().textContent().catch(() => "");
        if (
          text &&
          /required|invalid|missing|please (enter|provide|fill)|cannot be blank|is not valid/i.test(
            text
          )
        ) {
          return `form_validation_error: ${text.slice(0, 100)}`;
        }
      }
    } catch {
      // Selector might not be valid — skip
    }
  }

  return null;
}
