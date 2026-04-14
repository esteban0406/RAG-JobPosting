"use client";

import { useState, useEffect } from "react";
import { Sparkles, Check, Info } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fetchApi } from "@/lib/api";
import type { Job } from "@/components/jobs/JobCard";
import { JobCard } from "@/components/jobs/JobCard";
import { JobDetailDrawer } from "@/components/jobs/JobDetailDrawer";
import { SavedJobsAiDrawer } from "./SavedJobsAiDrawer";

interface SavedJobsGridProps {
  initialJobs: Job[];
}

export function SavedJobsGrid({ initialJobs }: SavedJobsGridProps) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [aiOpen, setAiOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Auto-open AI drawer when first job is selected
  useEffect(() => {
    if (selected.size === 1) {
      setAiOpen(true);
    }
  }, [selected.size]);

  function toggleSelect(jobId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  }

  async function handleUnsave(jobId: string) {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(jobId);
      return next;
    });
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

  const selectedIds = Array.from(selected);

  return (
    <>
      {/* Context banner */}
      {selected.size === 0 ? (
        <div className="flex items-start gap-3 bg-accent/8 border border-accent/20 rounded-[var(--radius-md)] px-4 py-3 mb-6">
          <Info size={16} className="text-accent shrink-0 mt-0.5" />
          <p className="text-text-secondary text-sm leading-relaxed">
            Select one or more jobs below to give the AI context about those specific roles, then click{" "}
            <span className="font-semibold text-text-primary">Ask AI</span>.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 bg-[#10b98112] border border-[#10b98130] rounded-[var(--radius-md)] px-4 py-3 mb-6">
          <Check size={16} className="text-[#10b981] shrink-0" />
          <p className="text-text-secondary text-sm">
            <span className="font-semibold text-text-primary">{selected.size} job{selected.size > 1 ? "s" : ""} selected</span>
            {" "}— AI will answer about {selected.size > 1 ? "these roles" : "this role"}.
          </p>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-text-muted text-xs hover:text-text-primary transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Jobs grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {jobs.map((job) => (
          <div key={job.id} className="relative group/card">
            {/* Selection checkbox */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleSelect(job.id);
              }}
              className={cn(
                "absolute top-3 left-3 z-10 w-5 h-5 rounded-[var(--radius-sm)] border-2 flex items-center justify-center transition-all",
                selected.has(job.id)
                  ? "bg-accent border-accent"
                  : "bg-bg-surface border-border opacity-0 group-hover/card:opacity-100",
              )}
              title={selected.has(job.id) ? "Deselect job" : "Select job for AI context"}
            >
              {selected.has(job.id) && <Check size={11} className="text-white" strokeWidth={3} />}
            </button>

            {/* Card with left padding when checkbox visible */}
            <div className={cn(selected.has(job.id) ? "pl-2" : "")}>
              <JobCard
                job={job}
                isSaved={true}
                onClick={() => {
                  setSelectedJob(job);
                  setDetailOpen(true);
                }}
                onSaveToggle={() => handleUnsave(job.id)}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Floating Ask AI button */}
      <button
        onClick={() => setAiOpen(true)}
        className="fixed bottom-8 right-8 flex items-center gap-2.5 bg-accent text-white font-semibold text-[15px] px-5 py-3.5 rounded-full hover:opacity-90 transition-opacity z-10"
        style={{ boxShadow: "0 4px 24px #7C3AED60" }}
      >
        <Sparkles size={18} />
        Ask AI
      </button>

      {/* AI drawer */}
      <SavedJobsAiDrawer
        open={aiOpen}
        onOpenChange={setAiOpen}
        contextJobIds={selectedIds}
      />

      {/* Job detail drawer */}
      <JobDetailDrawer
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
