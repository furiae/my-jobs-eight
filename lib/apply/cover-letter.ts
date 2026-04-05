/**
 * AI cover letter customization using the Claude API.
 *
 * Generates a tailored cover letter for each job by adapting the base
 * template to the specific role, company, and job description.
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Profile } from "./profile";

const BASE_COVER_LETTER = `Dear Hiring Manager,

I am writing to express my interest in the Product Design leadership opportunity within your organization. With more than two decades of experience leading UX, product design, and digital innovation initiatives, I bring a track record of building high-performing teams, scaling design systems, and delivering measurable business growth through human-centered strategy.

Currently serving as Senior Product Designer at Furiae Interactive, I pioneered a collaborative UX process that increased user engagement by 400% while reducing development time by 30%. I also established a structured user interview framework across platforms and led early AI product prototyping initiatives that accelerated testing cycles and positioned our applications at the forefront of innovation.

Previously, as Director of UX/Product Design at WebMD/Staywell and other enterprise organizations, I scaled teams by 500%, led portfolios of 15+ AI-driven healthcare initiatives, and streamlined end-to-end design operations to increase delivery speed by 30% while maintaining client satisfaction scores above 4.8/5. Across multiple organizations, I have consistently aligned UX strategy with executive vision, contributing to revenue growth, improved engagement, and operational efficiency.

What distinguishes my leadership approach is the balance of vision and execution. I have built and mentored multidisciplinary teams, introduced scalable design systems, implemented experimentation frameworks, and partnered closely with engineering and product leadership to bring zero-to-one innovations to market. My foundation in web design and animation, combined with modern AI-driven product strategy, allows me to connect brand, experience, and technology in ways that drive measurable impact.

I am excited about the opportunity to contribute strategic design leadership, foster innovation, and help shape the next phase of growth for your organization. I welcome the opportunity to discuss how my experience can support your goals.

Thank you for your time and consideration.

Sincerely,
Christopher Johnson
(615) 457-0699
https://cajohnsononline.com/`;

export interface JobContext {
  title: string;
  company: string;
  description?: string | null;
  source?: string;
}

export interface CoverLetterResult {
  text: string;
  /** Path to a temp .txt file suitable for upload fields */
  tempFilePath: string;
  /** True when AI generation failed and static fallback was used */
  isFallback: boolean;
}

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/**
 * Build a static fallback cover letter using profile data and job context.
 * Used when AI generation is unavailable.
 */
function buildFallbackLetter(job: JobContext, profile: Profile): string {
  return `Dear Hiring Manager,

I am writing to express my interest in the ${job.title} position at ${job.company}. With more than two decades of experience leading UX, product design, and digital innovation initiatives, I bring a track record of building high-performing teams, scaling design systems, and delivering measurable business growth through human-centered strategy.

Currently serving as Senior Product Designer at Furiae Interactive, I pioneered a collaborative UX process that increased user engagement by 400% while reducing development time by 30%. I also established a structured user interview framework across platforms and led early AI product prototyping initiatives that accelerated testing cycles and positioned our applications at the forefront of innovation.

Previously, as Director of UX/Product Design at WebMD/Staywell and other enterprise organizations, I scaled teams by 500%, led portfolios of 15+ AI-driven healthcare initiatives, and streamlined end-to-end design operations to increase delivery speed by 30% while maintaining client satisfaction scores above 4.8/5. Across multiple organizations, I have consistently aligned UX strategy with executive vision, contributing to revenue growth, improved engagement, and operational efficiency.

What distinguishes my leadership approach is the balance of vision and execution. I have built and mentored multidisciplinary teams, introduced scalable design systems, implemented experimentation frameworks, and partnered closely with engineering and product leadership to bring zero-to-one innovations to market. My foundation in web design and animation, combined with modern AI-driven product strategy, allows me to connect brand, experience, and technology in ways that drive measurable impact.

I am excited about the opportunity to contribute strategic design leadership, foster innovation, and help shape the next phase of growth at ${job.company}. I welcome the opportunity to discuss how my experience can support your goals.

Thank you for your time and consideration.

Sincerely,
${profile.fullName}
${profile.phone}
${profile.portfolio}`;
}

/**
 * Generate a customized cover letter for a specific job.
 * Falls back to a static template if the API call fails — never throws.
 */
export async function generateCoverLetter(
  job: JobContext,
  profile: Profile
): Promise<CoverLetterResult> {
  let text: string;
  let isFallback = false;

  try {
    text = await callClaude(job, profile);
  } catch (err) {
    console.warn(`[cover-letter] AI generation failed for ${job.company} — ${job.title}: ${err}`);
    console.warn("[cover-letter] Using static fallback cover letter");
    text = buildFallbackLetter(job, profile);
    isFallback = true;
  }

  try {
    const tempFilePath = writeTempFile(text, job.company, job.title);
    return { text, tempFilePath, isFallback };
  } catch (err) {
    console.error(`[cover-letter] Failed to write temp file: ${err}`);
    const tempFilePath = path.join(os.tmpdir(), `cover-letter-fallback-${Date.now()}.txt`);
    fs.writeFileSync(tempFilePath, text, "utf-8");
    return { text, tempFilePath, isFallback };
  }
}

async function callClaude(job: JobContext, profile: Profile): Promise<string> {
  const client = getClient();

  const descriptionSection = job.description
    ? `\n\nJob description:\n${job.description.slice(0, 3000)}`
    : "";

  const prompt = `You are helping ${profile.fullName} apply for a job. Customize the cover letter below for the specific role and company. Keep the same professional tone, length, and first-person voice. Preserve all factual claims (metrics, company names, titles). Only change the opening line and any references to the specific role/company so they match the target job. Do not add filler phrases or change the signature block.

Target role: ${job.title}
Target company: ${job.company}${descriptionSection}

Base cover letter:
${BASE_COVER_LETTER}

Return only the customized cover letter text. No preamble, no markdown, no commentary.`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  return block.text.trim();
}

/**
 * Write the cover letter to a temp file and return its path.
 * Caller is responsible for deleting it after use.
 */
function writeTempFile(text: string, company: string, title: string): string {
  const safeName = `${company}-${title}`
    .replace(/[^a-z0-9]/gi, "-")
    .toLowerCase()
    .slice(0, 60);
  const filePath = path.join(os.tmpdir(), `cover-letter-${safeName}-${Date.now()}.txt`);
  fs.writeFileSync(filePath, text, "utf-8");
  return filePath;
}

/** Clean up a temp cover letter file after use. */
export function deleteTempFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}
