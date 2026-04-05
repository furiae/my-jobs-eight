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
}

const SOURCES = ["We Work Remotely", "Remote OK", "Remotive", "UIUXJobsBoard", "RemoteJobs.io", "LinkedIn", "Indeed", "Dice", "Monster", "FlexJobs"];

export default function Page() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [filter, setFilter] = useState("");
  const [source, setSource] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
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

  const filtered = filter
    ? jobs.filter(
        (j) =>
          j.title.toLowerCase().includes(filter.toLowerCase()) ||
          j.company.toLowerCase().includes(filter.toLowerCase())
      )
    : jobs;

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
          <button
            onClick={handleScrape}
            disabled={scraping}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            {scraping ? "Refreshing…" : "Refresh Now"}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input
            type="text"
            placeholder="Filter by title…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSource(null)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                source === null
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              All
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
        </div>

        <p className="text-sm text-gray-500 mb-4">
          {loading ? "Loading…" : `${filtered.length} listings`}
          {!loading && total > filtered.length && ` (filtered from ${total})`}
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
              className="block bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-5 transition-colors group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
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
                <div className="text-right shrink-0">
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
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}
