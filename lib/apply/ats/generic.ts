import type { Page } from "playwright";
import { PROFILE } from "../profile";
import type { ApplyResult } from "../types";

// Generic form filler — best-effort for unknown ATS platforms.
// Tries common field patterns and uploads resume.
export async function applyGeneric(
  page: Page,
  applyUrl: string,
  coverLetterPath?: string
): Promise<ApplyResult> {
  await page.goto(applyUrl, { waitUntil: "networkidle", timeout: 30000 });

  // If there is no form on the page at all, flag as manual
  const formCount = await page.locator("form").count();
  if (formCount === 0) {
    return { success: false, reason: "no_form_found" };
  }

  // Detect CAPTCHA before attempting — mark as manual_required
  const hasCaptcha =
    (await page.locator("iframe[src*='recaptcha'], .g-recaptcha, .h-captcha").count()) > 0;
  if (hasCaptcha) {
    return { success: false, reason: "captcha_detected" };
  }

  try {
    // Name fields
    await fillByLabel(page, /first\s*name/i, PROFILE.firstName);
    await fillByLabel(page, /last\s*name/i, PROFILE.lastName);
    await fillByLabel(page, /^(full\s*)?name$/i, PROFILE.fullName);
    // Email
    await fillByLabel(page, /e[\s-]?mail/i, PROFILE.email);
    await fillByType(page, "email", PROFILE.email);
    // Phone
    await fillByLabel(page, /phone|mobile|tel/i, PROFILE.phone);
    await fillByType(page, "tel", PROFILE.phone);
    // LinkedIn
    await fillByLabel(page, /linkedin/i, PROFILE.linkedin);
    // Portfolio / website
    await fillByLabel(page, /portfolio|website/i, PROFILE.portfolio);
    // Location
    await fillByLabel(page, /city/i, PROFILE.city);
    await fillByLabel(page, /state/i, PROFILE.state);
    await fillByLabel(page, /zip|postal/i, PROFILE.zip);

    // Resume upload — take first file input
    const fileInputs = page.locator('input[type="file"]');
    if ((await fileInputs.count()) > 0) {
      await fileInputs.first().setInputFiles(PROFILE.resumePath);
      await page.waitForTimeout(1000);
    }

    // Cover letter — try textarea first, then file upload
    if (coverLetterPath) {
      const { readFileSync } = await import("fs");
      const coverText = readFileSync(coverLetterPath, "utf-8");

      const coverTextarea = page.locator('textarea[name*="cover" i], textarea[id*="cover" i], textarea[placeholder*="cover" i]');
      if ((await coverTextarea.count()) > 0) {
        await coverTextarea.first().fill(coverText);
      } else {
        const coverFileInput = page.locator('input[type="file"][name*="cover" i], input[type="file"][id*="cover" i]');
        if ((await coverFileInput.count()) > 0) {
          await coverFileInput.first().setInputFiles(coverLetterPath);
        }
      }
    }

    // Try to find and click submit
    const submitBtn = page
      .locator('button[type="submit"], input[type="submit"]')
      .filter({ hasText: /submit|apply|send/i });

    if ((await submitBtn.count()) === 0) {
      // No recognizable submit — manual needed
      return { success: false, reason: "no_submit_button" };
    }

    await submitBtn.first().click();
    await page.waitForTimeout(3000);

    const success =
      (await page
        .locator("text=/thank you|application received|submitted|we'll be in touch/i")
        .count()) > 0 ||
      page.url().includes("confirmation") ||
      page.url().includes("thank") ||
      page.url().includes("success");

    return {
      success,
      reason: success ? undefined : "submit_unclear",
      finalUrl: page.url(),
    };
  } catch (err) {
    return { success: false, reason: String(err) };
  }
}

// Fill input associated with a label matching the regex
async function fillByLabel(page: Page, labelRegex: RegExp, value: string) {
  try {
    const label = page.getByLabel(labelRegex).first();
    if ((await label.count()) > 0) {
      await label.fill(value);
    }
  } catch {
    // skip
  }
}

// Fill first input of a given type that is empty
async function fillByType(page: Page, type: string, value: string) {
  try {
    const inputs = page.locator(`input[type="${type}"]`);
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const el = inputs.nth(i);
      const current = await el.inputValue();
      if (!current) {
        await el.fill(value);
        break;
      }
    }
  } catch {
    // skip
  }
}
