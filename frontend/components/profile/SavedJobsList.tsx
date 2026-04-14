"use client";

import { useState } from "react";
import { Bookmark, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { fetchApi } from "@/lib/api";
import type { Job } from "@/components/jobs/JobCard";
import { JobDetailDrawer } from "@/components/jobs/JobDetailDrawer";

interface SavedJobsListProps {
  initialJobs: Job[];
}

export function SavedJobsList({ initialJobs }: SavedJobsListProps) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function handleUnsave(jobId: string) {
    // Optimistic remove
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    try {
      await fetchApi(`/users/me/favorites/${jobId}`, { method: "DELETE" });
      toast.success("Job removed from saved");
    } catch {
      // Revert
      const job = initialJobs.find((j) => j.id === jobId);
      if (job) setJobs((prev) => [...prev, job]);
      toast.error("Failed to unsave job");
    }
  }

  if (jobs.length === 0) {
    return (
      <p className="text-text-muted text-sm">
        No saved jobs yet. Bookmark jobs from the{" "}
        <a href="/jobs" className="text-accent-glow hover:underline">
          jobs list
        </a>
        .
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="flex items-center justify-between px-4 py-3.5 bg-bg-surface border border-border rounded-[var(--radius-md)]"
          >
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-text-primary text-sm font-semibold truncate">
                {job.title}
              </span>
              <span className="text-text-secondary text-xs">
                {job.company}
                {job.location ? ` · ${job.location}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-4">
              <button
                onClick={() => handleUnsave(job.id)}
                title="Unsave job"
                className="text-accent hover:text-text-muted transition-colors"
              >
                <Bookmark size={18} className="fill-accent" />
              </button>
              <button
                onClick={() => {
                  setSelectedJob(job);
                  setDrawerOpen(true);
                }}
                title="View job"
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <JobDetailDrawer
        job={selectedJob}
        open={drawerOpen}
        isSaved={true}
        onClose={() => {
          setDrawerOpen(false);
          setTimeout(() => setSelectedJob(null), 300);
        }}
        onSaveToggle={() => {
          if (selectedJob) {
            handleUnsave(selectedJob.id);
            setDrawerOpen(false);
          }
        }}
      />
    </>
  );
}
