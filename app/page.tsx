"use client";

import { useState, useEffect, useCallback } from "react";

interface Job {
  id: string;
  url: string;
  title: string;
  company: string;
  salary: string | null;
  location: string;
  description: string;
  source: string;
  posted_at: string | null;
  scraped_at: string;
  applied_at: string | null;
  application_status: string | null;
  ats_platform: string | null;
  error_message: string | null;
  cover_letter_text: string | null;
  apply_url: string | null;
}

type StatusFilter = "all" | "applied" | "failed" | "manual_required" | "not_applied";

const SOURCES = ["We Work Remotely", "Remote OK", "Remotive", "UIUXJobsBoard", "RemoteJobs.io", "LinkedIn", "Indeed", "Dice", "Monster", "FlexJobs"];

const STATUS_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  applied: { label: "Applied", bg: "bg-green-900/50", text: "text-green-400" },
  failed: { label: "Failed", bg: "bg-red-900/50", text: "text-red-400" },
  manual_required: { label: "Manual Required", bg: "bg-yellow-900/50", text: "text-yellow-400" },
  pending: { label: "Pending", bg: "bg-blue-900/50", text: "text-blue-400" },
  skipped: { label: "Skipped", bg: "bg-gray-800", text: "text-gray-400" },
};

export default function Page() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [filter, setFilter] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [expandedCoverLetter, setExpandedCoverLetter] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (source) params.set("source", source);
      const res = await fetch(`/api/jobs?${params}`);
      const data = await res.json();
      setJobs(data.jobs || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleScrape = async () => {
    setScraping(true);
    try {
      await fetch("/api/scrape");
      await fetchJobs();
    } finally {
      setScraping(false);
    }
  };

  const handleApply = async (e: React.MouseEvent, jobId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const res = await fetch("/api/jobs/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    if (res.ok) {
      const { job } = await res.json();
      setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
    }
  };

  const handleUnapply = async (e: React.MouseEvent, jobId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const res = await fetch("/api/jobs/apply", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    if (res.ok) {
      const { job } = await res.json();
      setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
    }
  };

  const handleRetry = async (e: React.MouseEvent, jobId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const res = await fetch("/api/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    if (res.ok) {
      await fetchJobs();
    }
  };

  const getAppStatus = (job: Job): string | null => {
    return job.application_status || (job.applied_at ? "applied" : null);
  };

  const filtered = jobs.filter((j) => {
    if (filter && !j.title.toLowerCase().includes(filter.toLowerCase()) && !j.company.toLowerCase().includes(filter.toLowerCase())) {
      return false;
    }
    const appStatus = getAppStatus(j);
    switch (statusFilter) {
      case "applied":
        return appStatus === "applied";
      case "failed":
        return appStatus === "failed";
      case "manual_required":
        return appStatus === "manual_required";
      case "not_applied":
        return !appStatus || appStatus === "skipped";
      default:
        return true;
    }
  });

  const statusCounts = {
    applied: jobs.filter((j) => getAppStatus(j) === "applied").length,
    failed: jobs.filter((j) => getAppStatus(j) === "failed").length,
    manual_required: jobs.filter((j) => getAppStatus(j) === "manual_required").length,
    not_applied: jobs.filter((j) => { const s = getAppStatus(j); return !s || s === "skipped"; }).length,
  };

  const toggleExpand = (e: React.MouseEvent, jobId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedJob(expandedJob === jobId ? null : jobId);
  };

  const toggleCoverLetter = (e: React.MouseEvent, jobId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedCoverLetter(expandedCoverLetter === jobId ? null : jobId);
  };

  const statusFilterButtons: { key: StatusFilter; label: string; count: number; activeClass: string }[] = [
    { key: "all", label: "All", count: jobs.length, activeClass: "bg-blue-600 text-white" },
    { key: "applied", label: "Applied", count: statusCounts.applied, activeClass: "bg-green-600 text-white" },
    { key: "failed", label: "Failed", count: statusCounts.failed, activeClass: "bg-red-600 text-white" },
    { key: "manual_required", label: "Manual", count: statusCounts.manual_required, activeClass: "bg-yellow-600 text-white" },
    { key: "not_applied", label: "Not Applied", count: statusCounts.not_applied, activeClass: "bg-gray-600 text-white" },
  ];

  const cardBorder = (job: Job) => {
    const status = getAppStatus(job);
    switch (status) {
      case "applied": return "bg-green-950/30 border-green-800/50 hover:border-green-600";
      case "failed": return "bg-red-950/20 border-red-800/50 hover:border-red-600";
      case "manual_required": return "bg-yellow-950/20 border-yellow-800/50 hover:border-yellow-600";
      default: return "bg-gray-900 border-gray-800 hover:border-gray-600";
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">My Jobs</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Remote design jobs — Product Designer, UX Designer, Figma Designer
            </p>
          </div>
          <div className="flex items-center gap-3">
            {statusCounts.applied > 0 && (
              <span className="text-sm text-green-400">{statusCounts.applied} applied</span>
            )}
            {statusCounts.failed > 0 && (
              <span className="text-sm text-red-400">{statusCounts.failed} failed</span>
            )}
            <button
              onClick={handleScrape}
              disabled={scraping}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {scraping ? "Refreshing…" : "Refresh Now"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input
            type="text"
            placeholder="Filter by title or company…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <div className="flex gap-2 flex-wrap">
            {statusFilterButtons.map((btn) => (
              <button
                key={btn.key}
                onClick={() => setStatusFilter(btn.key)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === btn.key
                    ? btn.activeClass
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {btn.label}
                {btn.count > 0 && (
                  <span className="ml-1.5 text-xs opacity-75">({btn.count})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mb-4">
          <button
            onClick={() => setSource(null)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              source === null
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            All Sources
          </button>
          {SOURCES.map((s) => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                source === s
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <p className="text-sm text-gray-500 mb-4">
          {loading ? "Loading…" : `${filtered.length} listings`}
          {!loading && total > filtered.length && ` (${total} total)`}
        </p>

        <div className="space-y-3">
          {!loading && filtered.length === 0 && (
            <p className="text-center text-gray-600 py-12">
              No jobs found. Try refreshing or changing filters.
            </p>
          )}
          {filtered.map((job) => {
            const appStatus = getAppStatus(job);
            const badge = appStatus ? STATUS_BADGES[appStatus] : null;
            const isExpanded = expandedJob === job.id;
            const isCoverLetterExpanded = expandedCoverLetter === job.id;

            return (
              <div key={job.id} className={`border rounded-xl transition-colors ${cardBorder(job)}`}>
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-5 group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="font-medium text-white group-hover:text-blue-400 transition-colors truncate">
                        {job.title}
                      </h2>
                      <p className="text-sm text-gray-400 mt-0.5">
                        {job.company}
                        {job.salary && (
                          <span className="ml-2 text-green-400">{job.salary}</span>
                        )}
                      </p>
                      {/* ATS platform + status row */}
                      <div className="flex items-center gap-2 mt-1.5">
                        {badge && (
                          <span className={`text-xs ${badge.text} ${badge.bg} px-2 py-0.5 rounded`}>
                            {badge.label}
                          </span>
                        )}
                        {job.ats_platform && (
                          <span className="text-xs text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded">
                            {job.ats_platform}
                          </span>
                        )}
                        {job.applied_at && appStatus === "applied" && (
                          <span className="text-xs text-gray-500">
                            {new Date(job.applied_at).toLocaleDateString()}{" "}
                            {new Date(job.applied_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {appStatus === "failed" && (
                        <>
                          {job.error_message && (
                            <button
                              onClick={(e) => toggleExpand(e, job.id)}
                              className="text-xs text-red-400 hover:text-red-300 bg-red-900/30 hover:bg-red-900/50 px-2 py-1 rounded transition-colors"
                            >
                              {isExpanded ? "Hide Error" : "Show Error"}
                            </button>
                          )}
                          <button
                            onClick={(e) => handleRetry(e, job.id)}
                            className="text-xs text-orange-400 hover:text-orange-300 bg-orange-900/30 hover:bg-orange-900/50 px-3 py-1 rounded-lg transition-colors"
                          >
                            Retry
                          </button>
                        </>
                      )}
                      {appStatus === "applied" && (
                        <button
                          onClick={(e) => handleUnapply(e, job.id)}
                          className="text-xs text-gray-500 hover:text-red-400 px-2 py-1 rounded hover:bg-gray-800 transition-colors"
                          title="Remove applied status"
                        >
                          Undo
                        </button>
                      )}
                      {!appStatus && (
                        <button
                          onClick={(e) => handleApply(e, job.id)}
                          className="text-xs text-blue-400 hover:text-blue-300 bg-blue-900/30 hover:bg-blue-900/50 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Mark Applied
                        </button>
                      )}
                      {job.cover_letter_text && (
                        <button
                          onClick={(e) => toggleCoverLetter(e, job.id)}
                          className="text-xs text-cyan-400 hover:text-cyan-300 bg-cyan-900/30 hover:bg-cyan-900/50 px-2 py-1 rounded transition-colors"
                        >
                          {isCoverLetterExpanded ? "Hide Letter" : "Cover Letter"}
                        </button>
                      )}
                      <div className="text-right">
                        <span className="text-xs text-gray-600 bg-gray-800 px-2 py-1 rounded">
                          {job.source}
                        </span>
                        {job.posted_at && (
                          <p className="text-xs text-gray-600 mt-1">
                            {new Date(job.posted_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </a>

                {/* Expandable error detail */}
                {isExpanded && job.error_message && (
                  <div className="px-5 pb-4 border-t border-red-800/30">
                    <p className="text-xs text-red-300 mt-3 font-mono whitespace-pre-wrap break-all">
                      {job.error_message}
                    </p>
                  </div>
                )}

                {/* Expandable cover letter */}
                {isCoverLetterExpanded && job.cover_letter_text && (
                  <div className="px-5 pb-4 border-t border-cyan-800/30">
                    <p className="text-sm text-gray-300 mt-3 whitespace-pre-wrap">
                      {job.cover_letter_text}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
