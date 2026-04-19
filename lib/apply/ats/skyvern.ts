/**
 * Skyvern adapter — routes complex ATS forms through the self-hosted Skyvern API.
 * Skyvern uses AI-powered browser automation to handle forms that Playwright scripts cannot.
 */

import { PROFILE } from "../profile";
import type { ApplyResult } from "../types";

const SKYVERN_BASE_URL = process.env.SKYVERN_BASE_URL || "http://localhost:8000";
const SKYVERN_API_KEY = process.env.SKYVERN_API_KEY || "";

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_TIME_MS = 180_000; // 3 minutes max

interface SkyvernRunResponse {
  run_id: string;
  status: string;
  output: Record<string, unknown> | null;
  failure_reason: string | null;
}

/**
 * Apply to a job via Skyvern's AI browser automation.
 * Creates a task, polls until completion, and returns the result.
 */
export async function applySkyvern(
  applyUrl: string,
  coverLetterText?: string,
): Promise<ApplyResult> {
  if (!SKYVERN_API_KEY) {
    return { success: false, reason: "skyvern_api_key_missing" };
  }

  const prompt = buildApplicationPrompt(applyUrl, coverLetterText);

  // Create task
  let runId: string;
  try {
    const createRes = await fetch(`${SKYVERN_BASE_URL}/v1/run/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": SKYVERN_API_KEY,
      },
      body: JSON.stringify({
        prompt,
        url: applyUrl,
        engine: "skyvern-1.0",
        title: `Auto-apply: ${applyUrl.slice(0, 80)}`,
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.log(`[apply:skyvern] task creation failed: ${createRes.status} ${errText.slice(0, 200)}`);
      return { success: false, reason: `skyvern_create_${createRes.status}` };
    }

    const data = (await createRes.json()) as SkyvernRunResponse;
    runId = data.run_id;
    console.log(`[apply:skyvern] task created: ${runId}`);
  } catch (err) {
    console.log(`[apply:skyvern] task creation error: ${err}`);
    return { success: false, reason: "skyvern_create_error" };
  }

  // Poll for completion
  const deadline = Date.now() + MAX_POLL_TIME_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    try {
      const pollRes = await fetch(`${SKYVERN_BASE_URL}/v1/runs/${runId}`, {
        headers: { "x-api-key": SKYVERN_API_KEY },
      });

      if (!pollRes.ok) continue;

      const run = (await pollRes.json()) as SkyvernRunResponse;

      if (run.status === "completed") {
        console.log(`[apply:skyvern] task completed: ${runId}`);
        return { success: true, finalUrl: applyUrl };
      }

      if (["failed", "terminated", "timed_out", "canceled"].includes(run.status)) {
        const reason = run.failure_reason || run.status;
        console.log(`[apply:skyvern] task ${run.status}: ${reason}`);
        return { success: false, reason: `skyvern_${reason}` };
      }

      // Still running, continue polling
    } catch {
      // Network error during poll, will retry
    }
  }

  console.log(`[apply:skyvern] task timed out after ${MAX_POLL_TIME_MS}ms: ${runId}`);
  return { success: false, reason: "skyvern_timeout" };
}

function buildApplicationPrompt(applyUrl: string, coverLetterText?: string): string {
  const coverLetter = coverLetterText ||
    "I am an experienced UX/Product Designer with expertise in user-centered design, Figma, and design systems. I would love to bring my skills to your team.";

  return `Navigate to this job application page and fill out the application form completely. Then submit the application.

Use the following information to fill form fields:

- First Name: ${PROFILE.firstName}
- Last Name: ${PROFILE.lastName}
- Full Name: ${PROFILE.fullName}
- Email: ${PROFILE.email}
- Phone: ${PROFILE.phone}
- Address: ${PROFILE.address}
- City: ${PROFILE.city}
- State: ${PROFILE.stateFullName}
- Zip: ${PROFILE.zip}
- Country: ${PROFILE.country}
- LinkedIn URL: ${PROFILE.linkedin}
- Portfolio/Website: ${PROFILE.portfolio}
- Work Authorization: Yes, authorized to work in the United States
- Requires Visa Sponsorship: No
- Gender: ${PROFILE.gender}
- Ethnicity: ${PROFILE.ethnicity}
- Veteran Status: ${PROFILE.veteranStatus}

For any cover letter, message, or "why do you want to work here" field, use this text:
${coverLetter}

For salary expectation fields, use: $${PROFILE.salary.minimumAnnual.toLocaleString()} annually

Instructions:
1. If the page has an "Apply" button that leads to an application form, click it first
2. Fill in all required fields using the information above
3. For any field not covered above, select the most reasonable option or leave blank if optional
4. Upload resume if there is a file upload field (skip if not possible)
5. Submit the application by clicking the Submit/Apply button
6. Report the final result`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
