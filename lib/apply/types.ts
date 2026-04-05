export interface ApplyResult {
  success: boolean;
  reason?: string; // failure reason or "submit_unclear"
  finalUrl?: string;
}

export type AtsPlatform =
  | "greenhouse"
  | "lever"
  | "workday"
  | "ashby"
  | "generic"
  | "unknown";

export interface PhaseTimeouts {
  pageLoadMs: number;
  formFillMs: number;
  submitMs: number;
}

export interface ApplicationRecord {
  jobId: string;
  jobUrl: string;
  jobTitle: string;
  company: string;
  status: "pending" | "applied" | "failed" | "manual_required" | "skipped";
  atsPlatform?: AtsPlatform;
  applyUrl?: string;
  errorMessage?: string;
  appliedAt?: Date;
  coverLetterText?: string;
}
