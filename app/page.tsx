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

type Tab = "new" | "applied";

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
  const [activeTab, setActiveTab] = useState<Tab>("new");
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
    if (activeTab === "applied") {
      return appStatus === "applied";
    }
    return appStatus !== "applied";
  });

  const appliedCount = jobs.filter((j) => getAppStatus(j) === "applied").length;
  const newCount = jobs.length - appliedCount;

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
      <header className="border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-6 pt-4 pb-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">My Jobs</h1>
              <p className="text-sm text-gray-400 mt-0.5">
                Remote design jobs — Product Designer, UX Designer, Figma Designer
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/api/resume"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Resume
              </a>
              <button
                onClick={handleScrape}
                disabled={scraping}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              >
                {scraping ? "Refreshing…" : "Refresh Now"}
              </button>
            </div>
          </div>
          <nav className="flex gap-0">
            <button
              onClick={() => setActiveTab("new")}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "new"
                  ? "border-blue-500 text-white"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              New Jobs
              {newCount > 0 && <span className="ml-2 text-xs opacity-60">({newCount})</span>}
            </button>
            <button
              onClick={() => setActiveTab("applied")}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "applied"
                  ? "border-green-500 text-white"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Applied Jobs
              {appliedCount > 0 && <span className="ml-1.5 text-xs opacity-60">({appliedCount})</span>}
            </button>
          </nav>
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
                      {/* Status + ATS row */}
                      <div className="flex items-center gap-2 mt-1.5">
                        {appStatus === "applied" && (
                          <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-900/50 px-2 py-0.5 rounded font-medium">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Applied
                          </span>
                        )}
                        {appStatus === "applied" && job.applied_at && (
                          <span className="text-xs text-green-500/70">
                            {new Date(job.applied_at).toLocaleDateString()}{" "}
                            {new Date(job.applied_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        {badge && appStatus !== "applied" && (
                          <span className={`text-xs ${badge.text} ${badge.bg} px-2 py-0.5 rounded`}>
                            {badge.label}
                          </span>
                        )}
                        {job.ats_platform && (
                          <span className="text-xs text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded">
                            {job.ats_platform}
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
                      {appStatus !== "applied" && (
                        <button
                          onClick={(e) => handleApply(e, job.id)}
                          className="text-xs text-green-400 hover:text-green-300 bg-green-900/30 hover:bg-green-900/50 px-3 py-1.5 rounded-lg transition-colors font-medium"
                        >
                          ✓ Mark Applied
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
