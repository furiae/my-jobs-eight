// Chris Johnson's personal profile for auto-filling job application forms.
// Update this file when personal info changes.

import * as path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "resume");

export const PROFILE = {
  firstName: "Chris",
  lastName: "Johnson",
  fullName: "Chris Johnson",
  email: "cjohnson@furiae-interactive.com",
  phone: "(615) 457-0699",
  address: "9104 Raindrop Circle",
  city: "Brentwood",
  state: "TN",
  stateFullName: "Tennessee",
  zip: "37027",
  country: "United States",
  linkedin: "https://linkedin.com/in/christopherajohnson",
  portfolio: "https://cajohnsononline.com/",
  github: "",
  dob: "1978-10-18",
  gender: "Male",
  ethnicity: "White / Caucasian",
  workAuthorization: true,
  requiresSponsorship: false,
  veteranStatus: "I am not a protected veteran",

  salary: {
    minimumHourly: 40,
    minimumAnnual: 75000,
    currency: "USD",
  },

  targetTitles: [
    "Product Designer",
    "UX Designer",
    "UX/UI Designer",
    "Web Designer",
    "UI Designer",
    "Figma Designer",
  ],

  resumePath: path.join(DATA_DIR, "Chris-Johnson-Resume-Feb-2026.pdf"),
  coverLetterPath: path.join(DATA_DIR, "Chris Johnson Cover Letter.pdf"),
  portfolioPdfPath: path.join(DATA_DIR, "Chris-Johnson-UX-Portfolio.pdf"),
} as const;

export type Profile = typeof PROFILE;

// Returns true if a job title matches Chris's target roles
export function titleMatches(title: string): boolean {
  const lower = title.toLowerCase();
  return [
    "product designer",
    "ux designer",
    "ui designer",
    "ux/ui",
    "web designer",
    "figma",
    "experience designer",
    "interaction designer",
    "visual designer",
    "design lead",
  ].some((keyword) => lower.includes(keyword));
}

// Returns true if salary string is at or above Chris's floor (best-effort parse)
export function salaryAboveFloor(salary: string | null): boolean {
  if (!salary) return true; // assume OK when not listed
  const numbers = salary.replace(/,/g, "").match(/\d+/g);
  if (!numbers) return true;
  const max = Math.max(...numbers.map(Number));
  // If any number looks like an annual salary
  if (max >= PROFILE.salary.minimumAnnual) return true;
  // If it looks hourly
  if (max >= PROFILE.salary.minimumHourly && max < 1000) return true;
  return false;
}
