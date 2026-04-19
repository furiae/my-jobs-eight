/**
 * LinkedIn session-cookie authentication for Playwright.
 *
 * Injects the `li_at` session cookie into a browser context so the
 * auto-apply engine can navigate LinkedIn job pages behind the auth wall.
 *
 * The board must provide their LinkedIn session cookie via the
 * `LINKEDIN_SESSION_COOKIE` env var. To obtain it:
 *   1. Log into linkedin.com in Chrome
 *   2. DevTools → Application → Cookies → linkedin.com → copy `li_at` value
 *   3. Set as GitHub secret / env var
 */

import type { BrowserContext } from "playwright";

const LINKEDIN_DOMAIN = ".linkedin.com";

/** Returns the li_at cookie value from env, or null if not configured. */
export function getLinkedInCookie(): string | null {
  const value = process.env.LINKEDIN_SESSION_COOKIE?.trim();
  return value || null;
}

/** Inject the li_at session cookie into a Playwright browser context. */
export async function injectLinkedInCookies(
  context: BrowserContext
): Promise<boolean> {
  const liAt = getLinkedInCookie();
  if (!liAt) return false;

  await context.addCookies([
    {
      name: "li_at",
      value: liAt,
      domain: LINKEDIN_DOMAIN,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "None",
    },
  ]);

  return true;
}

/**
 * Check whether a page is showing the LinkedIn login wall,
 * indicating the session cookie is stale or invalid.
 */
export function isLinkedInLoginPage(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("linkedin.com/login") ||
    u.includes("linkedin.com/uas/login") ||
    u.includes("linkedin.com/checkpoint") ||
    u.includes("linkedin.com/authwall")
  );
}

/** Returns true if a URL points to a LinkedIn job page. */
export function isLinkedInJobUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("linkedin.com/jobs/view") ||
    u.includes("linkedin.com/jobs/collections") ||
    u.includes("linkedin.com/jobs/search")
  );
}

/** Returns true if a URL is on linkedin.com (any path). */
export function isLinkedInUrl(url: string): boolean {
  return url.toLowerCase().includes("linkedin.com");
}
