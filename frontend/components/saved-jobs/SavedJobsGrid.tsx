"use client";

import { useState } from "react";
import { toast } from "sonner";
import { fetchApi } from "@/lib/api";
import { useAiStore } from "@/lib/ai-store";
import type { Job } from "@/components/jobs/JobCard";
import { JobCard } from "@/components/jobs/JobCard";
import { JobDetailModal } from "@/components/jobs/JobDetailModal";

interface SavedJobsGridProps {
  initialJobs: Job[];
}

export function SavedJobsGrid({ initialJobs }: SavedJobsGridProps) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { isOpen } = useAiStore();

  async function handleUnsave(jobId: string) {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    try {
      await fetchApi(`/users/me/favorites/${jobId}`, { method: "DELETE" });
      toast.success("Job removed from saved");
    } catch {
      const job = initialJobs.find((j) => j.id === jobId);
      if (job) setJobs((prev) => [...prev, job]);
      toast.error("Failed to unsave job");
    }
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <p className="text-text-muted text-sm">
          No saved jobs yet. Bookmark jobs from the{" "}
          <a href="/jobs" className="text-accent-glow hover:underline">
            Browse Jobs
          </a>{" "}
          page.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Jobs grid — 1 column when AI panel is open, 2 columns otherwise */}
      <div className={`grid gap-4 ${isOpen ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            isSaved={true}
            onClick={() => {
              setSelectedJob(job);
              setDetailOpen(true);
            }}
            onSaveToggle={() => handleUnsave(job.id)}
          />
        ))}
      </div>

      {/* Job detail modal */}
      <JobDetailModal
        job={selectedJob}
        open={detailOpen}
        isSaved={true}
        onClose={() => {
          setDetailOpen(false);
          setTimeout(() => setSelectedJob(null), 300);
        }}
        onSaveToggle={() => {
          if (selectedJob) {
            handleUnsave(selectedJob.id);
            setDetailOpen(false);
          }
        }}
      />
    </>
  );
}
