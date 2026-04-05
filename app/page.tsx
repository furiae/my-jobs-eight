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
}

const SOURCES = ["We Work Remotely", "Remote OK", "Remotive", "UIUXJobsBoard", "RemoteJobs.io", "LinkedIn", "Indeed", "Dice", "Monster", "FlexJobs"];

export default function Page() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [filter, setFilter] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [showApplied, setShowApplied] = useState<boolean | null>(null);

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

  const filtered = jobs.filter((j) => {
    if (filter && !j.title.toLowerCase().includes(filter.toLowerCase()) && !j.company.toLowerCase().includes(filter.toLowerCase())) {
      return false;
    }
    if (showApplied === true && !j.applied_at) return false;
    if (showApplied === false && j.applied_at) return false;
    return true;
  });

  const appliedCount = jobs.filter((j) => j.applied_at).length;

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
            {appliedCount > 0 && (
              <span className="text-sm text-green-400">{appliedCount} applied</span>
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
            <button
              onClick={() => setShowApplied(null)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                showApplied === null
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setShowApplied(true)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                showApplied === true
                  ? "bg-green-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              Applied
            </button>
            <button
              onClick={() => setShowApplied(false)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                showApplied === false
                  ? "bg-orange-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              Not Applied
            </button>
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
          {filtered.map((job) => (
            <a
              key={job.id}
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`block border rounded-xl p-5 transition-colors group ${
                job.applied_at
                  ? "bg-green-950/30 border-green-800/50 hover:border-green-600"
                  : "bg-gray-900 border-gray-800 hover:border-gray-600"
              }`}
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
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {job.applied_at ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-green-400 bg-green-900/50 px-2 py-1 rounded">
                        Applied {new Date(job.applied_at).toLocaleDateString()}{" "}
                        {new Date(job.applied_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <button
                        onClick={(e) => handleUnapply(e, job.id)}
                        className="text-xs text-gray-500 hover:text-red-400 px-2 py-1 rounded hover:bg-gray-800 transition-colors"
                        title="Remove applied status"
                      >
                        Undo
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => handleApply(e, job.id)}
                      className="text-xs text-blue-400 hover:text-blue-300 bg-blue-900/30 hover:bg-blue-900/50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Mark Applied
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
          ))}
        </div>
      </main>
    </div>
  );
}
