/**
 * LinkedIn Easy Apply form handler.
 *
 * Handles the multi-step modal flow that LinkedIn uses for "Easy Apply"
 * job applications. Falls back to detecting external apply URLs and
 * dispatching to the appropriate ATS handler.
 */

import type { Page } from "playwright";
import { PROFILE } from "../profile";
import type { ApplyResult, PhaseTimeouts } from "../types";
import { isLinkedInLoginPage } from "../linkedin-auth";

const DEFAULT_TIMEOUTS: PhaseTimeouts = {
  pageLoadMs: 45_000,
  formFillMs: 60_000, // LinkedIn multi-step can be slow
  submitMs: 30_000,
};

// Human-like delay range (ms)
const MIN_ACTION_DELAY = 300;
const MAX_ACTION_DELAY = 1200;

async function humanDelay(page: Page): Promise<void> {
  const ms =
    MIN_ACTION_DELAY +
    Math.random() * (MAX_ACTION_DELAY - MIN_ACTION_DELAY);
  await page.waitForTimeout(ms);
}

export async function applyLinkedIn(
  page: Page,
  jobUrl: string,
  coverLetterPath: string,
  timeouts: PhaseTimeouts = DEFAULT_TIMEOUTS
): Promise<ApplyResult> {
  // ── Navigate ──
  try {
    await page.goto(jobUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeouts.pageLoadMs,
    });
    // Extra wait for LinkedIn SPA hydration
    await page.waitForTimeout(3000);
  } catch {
    return { success: false, reason: "timeout_page_load" };
  }

  // ── Session check ──
  if (isLinkedInLoginPage(page.url())) {
    return { success: false, reason: "linkedin_session_expired" };
  }

  // ── Find Easy Apply button ──
  const easyApplyBtn = page.locator(
    'button.jobs-apply-button, button:has-text("Easy Apply"), button[aria-label*="Easy Apply"]'
  ).first();

  if ((await easyApplyBtn.count()) === 0) {
    // Check for external apply link — LinkedIn sometimes links to company ATS
    const externalApplyLink = page.locator(
      'a:has-text("Apply"), a.jobs-apply-button, a[data-tracking-control-name*="apply"]'
    ).first();

    if ((await externalApplyLink.count()) > 0) {
      const href = await externalApplyLink.getAttribute("href");
      if (href && !href.includes("linkedin.com")) {
        // External ATS — return the URL so engine can dispatch to the right handler
        const fullUrl = href.startsWith("http")
          ? href
          : new URL(href, jobUrl).toString();
        return {
          success: false,
          reason: "linkedin_external_apply",
          finalUrl: fullUrl,
        };
      }
    }

    return { success: false, reason: "no_apply_link" };
  }

  // ── Click Easy Apply ──
  await humanDelay(page);
  await easyApplyBtn.click();

  // Wait for the modal to open
  try {
    await page.waitForSelector(
      '.jobs-easy-apply-modal, [data-test-modal], div[role="dialog"]',
      { timeout: 10_000 }
    );
  } catch {
    return { success: false, reason: "linkedin_modal_not_opened" };
  }

  // ── Multi-step form fill ──
  try {
    const fillResult = await Promise.race([
      fillLinkedInForm(page, coverLetterPath),
      new Promise<ApplyResult>((resolve) =>
        setTimeout(
          () => resolve({ success: false, reason: "timeout_form_fill" }),
          timeouts.formFillMs
        )
      ),
    ]);

    if (!fillResult.success) return fillResult;
  } catch (err) {
    return { success: false, reason: `linkedin_fill_error: ${String(err).slice(0, 200)}` };
  }

  return { success: true, finalUrl: page.url() };
}

/**
 * Fill LinkedIn Easy Apply multi-step form.
 * LinkedIn uses paginated steps with "Next" / "Review" / "Submit" buttons.
 */
async function fillLinkedInForm(
  page: Page,
  coverLetterPath: string
): Promise<ApplyResult> {
  const maxSteps = 10; // safety bound

  for (let step = 0; step < maxSteps; step++) {
    await humanDelay(page);

    // Fill any visible form fields on this step
    await fillCurrentStepFields(page, coverLetterPath);

    // Check for "Submit application" button — final step
    const submitBtn = page.locator(
      'button:has-text("Submit application"), button:has-text("Submit"), button[aria-label*="Submit application"]'
    ).first();

    if ((await submitBtn.count()) > 0) {
      await humanDelay(page);
      await submitBtn.click();

      // Wait for confirmation
      await page.waitForTimeout(3000);

      // Check for success indicators
      const successIndicators = [
        'h2:has-text("Your application was sent")',
        'h2:has-text("Application submitted")',
        'h3:has-text("Your application was sent")',
        ':has-text("You applied")',
        '.artdeco-modal__header:has-text("applied")',
        'div[data-test-modal-close-btn]', // dismiss button on success modal
      ];

      for (const selector of successIndicators) {
        if ((await page.locator(selector).count()) > 0) {
          // Dismiss the success modal if present
          const dismissBtn = page.locator(
            'button[aria-label="Dismiss"], button:has-text("Done"), button:has-text("Close")'
          ).first();
          if ((await dismissBtn.count()) > 0) {
            await dismissBtn.click().catch(() => {});
          }
          return { success: true };
        }
      }

      // Check for validation errors after submit
      const errorCount = await page.locator(
        '.artdeco-inline-feedback--error, [data-test-form-element-error]'
      ).count();

      if (errorCount > 0) {
        return { success: false, reason: "form_validation" };
      }

      // If no clear success or error, assume it worked (URL may have changed)
      return { success: true };
    }

    // Check for "Review" button (pre-submit step)
    const reviewBtn = page.locator(
      'button:has-text("Review"), button[aria-label*="Review"]'
    ).first();

    if ((await reviewBtn.count()) > 0) {
      await humanDelay(page);
      await reviewBtn.click();
      await page.waitForTimeout(2000);
      continue;
    }

    // Check for "Next" button
    const nextBtn = page.locator(
      'button:has-text("Next"), button[aria-label*="Next"]'
    ).first();

    if ((await nextBtn.count()) > 0) {
      // Before clicking next, check for validation errors
      const errorCount = await page.locator(
        '.artdeco-inline-feedback--error, [data-test-form-element-error]'
      ).count();

      if (errorCount > 0) {
        return { success: false, reason: "form_validation" };
      }

      await humanDelay(page);
      await nextBtn.click();
      await page.waitForTimeout(2000);
      continue;
    }

    // No navigation buttons found — stuck
    return { success: false, reason: "linkedin_stuck_no_nav_button" };
  }

  return { success: false, reason: "linkedin_too_many_steps" };
}

/** Fill form fields visible on the current Easy Apply step. */
async function fillCurrentStepFields(
  page: Page,
  coverLetterPath: string
): Promise<void> {
  // ── Text inputs ──
  const inputs = page.locator(
    '.jobs-easy-apply-modal input[type="text"], .jobs-easy-apply-modal input:not([type]), [role="dialog"] input[type="text"], [role="dialog"] input:not([type])'
  );
  const inputCount = await inputs.count();

  for (let i = 0; i < inputCount; i++) {
    const input = inputs.nth(i);
    const currentValue = await input.inputValue().catch(() => "");
    if (currentValue) continue; // already filled (LinkedIn pre-populates)

    const label = await getFieldLabel(page, input);
    const labelLower = label.toLowerCase();

    let value = "";
    if (/first\s*name/i.test(label)) value = PROFILE.firstName;
    else if (/last\s*name/i.test(label)) value = PROFILE.lastName;
    else if (/full\s*name|^name$/i.test(label)) value = PROFILE.fullName;
    else if (/e[\s-]?mail/i.test(label)) value = PROFILE.email;
    else if (/phone|mobile|tel/i.test(label)) value = PROFILE.phone;
    else if (/city|location/i.test(label)) value = PROFILE.city;
    else if (/state|province/i.test(label)) value = PROFILE.stateFullName;
    else if (/zip|postal/i.test(label)) value = PROFILE.zip;
    else if (/linkedin/i.test(label)) value = PROFILE.linkedin;
    else if (/portfolio|website|url/i.test(label)) value = PROFILE.portfolio;
    else if (/salary|compensation|pay/i.test(label))
      value = String(PROFILE.salary.minimumAnnual);
    else if (/years?\s*(of)?\s*experience/i.test(label)) value = "15";
    else if (/address/i.test(label)) value = PROFILE.address;
    else if (/country/i.test(label)) value = PROFILE.country;

    if (value) {
      await humanDelay(page);
      await input.fill(value).catch(() => {});
    }
  }

  // ── Select dropdowns ──
  const selects = page.locator(
    '.jobs-easy-apply-modal select, [role="dialog"] select'
  );
  const selectCount = await selects.count();

  for (let i = 0; i < selectCount; i++) {
    const select = selects.nth(i);
    const label = await getFieldLabel(page, select);

    if (/country/i.test(label)) {
      await select.selectOption({ label: "United States" }).catch(() => {});
    } else if (/state/i.test(label)) {
      await select.selectOption({ label: "Tennessee" }).catch(() => {});
    }
  }

  // ── Radio buttons (work authorization, sponsorship) ──
  const radioGroups = page.locator(
    '.jobs-easy-apply-modal fieldset, [role="dialog"] fieldset, .jobs-easy-apply-modal [role="radiogroup"], [role="dialog"] [role="radiogroup"]'
  );
  const radioGroupCount = await radioGroups.count();

  for (let i = 0; i < radioGroupCount; i++) {
    const group = radioGroups.nth(i);
    const groupText = (await group.textContent()) ?? "";
    const groupLower = groupText.toLowerCase();

    if (
      groupLower.includes("authorized") ||
      groupLower.includes("eligible to work") ||
      groupLower.includes("legally authorized") ||
      groupLower.includes("work authorization")
    ) {
      // Select "Yes"
      const yesRadio = group.locator('label:has-text("Yes"), input[value="Yes"]').first();
      if ((await yesRadio.count()) > 0) {
        await humanDelay(page);
        await yesRadio.click().catch(() => {});
      }
    } else if (
      groupLower.includes("sponsor") ||
      groupLower.includes("visa")
    ) {
      // Select "No" — does not require sponsorship
      const noRadio = group.locator('label:has-text("No"), input[value="No"]').first();
      if ((await noRadio.count()) > 0) {
        await humanDelay(page);
        await noRadio.click().catch(() => {});
      }
    } else if (groupLower.includes("gender")) {
      const maleRadio = group.locator('label:has-text("Male"), input[value="Male"]').first();
      if ((await maleRadio.count()) > 0) {
        await humanDelay(page);
        await maleRadio.click().catch(() => {});
      }
    } else if (groupLower.includes("veteran")) {
      const noRadio = group.locator(
        'label:has-text("not a protected veteran"), label:has-text("No")'
      ).first();
      if ((await noRadio.count()) > 0) {
        await humanDelay(page);
        await noRadio.click().catch(() => {});
      }
    }
  }

  // ── Resume upload ──
  const fileInputs = page.locator(
    '.jobs-easy-apply-modal input[type="file"], [role="dialog"] input[type="file"]'
  );
  if ((await fileInputs.count()) > 0) {
    // LinkedIn may already have a stored resume — only upload if prompted
    const uploadPrompt = page.locator(
      ':has-text("Upload resume"), :has-text("upload a resume"), :has-text("Be sure to include")'
    );
    if ((await uploadPrompt.count()) > 0) {
      await fileInputs.first().setInputFiles(PROFILE.resumePath).catch(() => {});
      await page.waitForTimeout(2000);
    }
  }

  // ── Cover letter textarea ──
  if (coverLetterPath) {
    const coverTextarea = page.locator(
      '.jobs-easy-apply-modal textarea, [role="dialog"] textarea'
    );
    if ((await coverTextarea.count()) > 0) {
      const { readFileSync } = await import("fs");
      const coverText = readFileSync(coverLetterPath, "utf-8");
      for (let i = 0; i < (await coverTextarea.count()); i++) {
        const ta = coverTextarea.nth(i);
        const currentVal = await ta.inputValue().catch(() => "");
        if (!currentVal) {
          await humanDelay(page);
          await ta.fill(coverText).catch(() => {});
          break;
        }
      }
    }
  }
}

/** Get the label text associated with a form field. */
async function getFieldLabel(page: Page, element: any): Promise<string> {
  try {
    // Try aria-label first
    const ariaLabel = await element.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel;

    // Try the id → for= association
    const id = await element.getAttribute("id");
    if (id) {
      const label = page.locator(`label[for="${id}"]`);
      if ((await label.count()) > 0) {
        return (await label.textContent()) ?? "";
      }
    }

    // Try parent label
    const parentLabel = element.locator("xpath=ancestor::label");
    if ((await parentLabel.count()) > 0) {
      return (await parentLabel.textContent()) ?? "";
    }

    // Try placeholder
    const placeholder = await element.getAttribute("placeholder");
    if (placeholder) return placeholder;

    // Try preceding label-like element
    const precedingLabel = element.locator(
      "xpath=preceding-sibling::label | preceding-sibling::span | preceding-sibling::div[contains(@class, 'label')]"
    );
    if ((await precedingLabel.count()) > 0) {
      return (await precedingLabel.first().textContent()) ?? "";
    }

    return "";
  } catch {
    return "";
  }
}
