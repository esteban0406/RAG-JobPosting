"use client";

import { useState, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { JobCard, type Job } from "./JobCard";
import { JobDetailModal } from "./JobDetailModal";
import { AiDrawer } from "@/components/ai/AiDrawer";
import { useAuthStore } from "@/lib/auth-store";
import { fetchApi, ApiError } from "@/lib/api";

interface JobsGridProps {
  jobs: Job[];
  total: number;
  page: number;
  limit: number;
  savedJobIds?: string[];
}

export function JobsGrid({
  jobs,
  total,
  page,
  limit,
  savedJobIds = [],
}: JobsGridProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set(savedJobIds));

  const totalPages = Math.ceil(total / limit);

  function openJob(job: Job) {
    setSelectedJob(job);
    setDetailOpen(true);
  }

  function closeDetail() {
    setDetailOpen(false);
    setTimeout(() => setSelectedJob(null), 300);
  }

  function handleCompanyFilter(company: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("keyword", company);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  const handleSaveToggle = useCallback(
    async (jobId: string) => {
      if (!isLoggedIn) {
        toast.error("Log in to save jobs", {
          action: { label: "Log in", onClick: () => router.push("/login") },
        });
        return;
      }

      const wasSaved = saved.has(jobId);
      // Optimistic update
      setSaved((prev) => {
        const next = new Set(prev);
        wasSaved ? next.delete(jobId) : next.add(jobId);
        return next;
      });

      try {
        if (wasSaved) {
          await fetchApi(`/users/me/favorites/${jobId}`, { method: "DELETE" });
        } else {
          await fetchApi(`/users/me/favorites/${jobId}`, { method: "POST" });
        }
      } catch (err) {
        // Revert on error
        setSaved((prev) => {
          const next = new Set(prev);
          wasSaved ? next.add(jobId) : next.delete(jobId);
          return next;
        });
        if (err instanceof ApiError && err.status === 401) {
          toast.error("Session expired, please log in again");
        } else {
          toast.error("Failed to update saved jobs");
          console.error("Save toggle error:", err);
        }
      }
    },
    [isLoggedIn, router, saved],
  );

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    router.push(`${pathname}?${params.toString()}`);
  }

  const col1 = jobs.filter((_, i) => i % 2 === 0);
  const col2 = jobs.filter((_, i) => i % 2 !== 0);

  return (
    <div className="relative flex-1">
      {/* Results count + sort */}
      <div className="flex items-center justify-between h-11 px-6">
        <span className="text-text-primary text-sm font-semibold">
          {total.toLocaleString()} jobs found
        </span>
      </div>

      {/* 2-column card grid */}
      <div className="flex gap-4 px-6 pb-6">
        <div className="flex flex-col gap-4 flex-1">
          {col1.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              isSaved={saved.has(job.id)}
              onClick={() => openJob(job)}
              onSaveToggle={() => handleSaveToggle(job.id)}
            />
          ))}
        </div>
        <div className="flex flex-col gap-4 flex-1">
          {col2.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              isSaved={saved.has(job.id)}
              onClick={() => openJob(job)}
              onSaveToggle={() => handleSaveToggle(job.id)}
            />
          ))}
        </div>
      </div>

      {/* Empty state */}
      {jobs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <span className="text-text-muted text-4xl">🔍</span>
          <p className="text-text-secondary">
            No jobs match your filters. Try adjusting your search.
          </p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pb-8">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="w-9 h-9 flex items-center justify-center border border-border rounded-[var(--radius-sm)] text-text-muted hover:text-text-primary hover:border-accent/50 transition-colors disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-text-secondary text-sm px-3">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            className="w-9 h-9 flex items-center justify-center border border-border rounded-[var(--radius-sm)] text-text-muted hover:text-text-primary hover:border-accent/50 transition-colors disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Floating Ask AI button */}
      <button
        onClick={() => setAiOpen(true)}
        className="fixed bottom-8 right-8 flex items-center gap-2.5 bg-accent text-white font-semibold text-[15px] px-5 py-3.5 rounded-full hover:opacity-90 transition-opacity z-10"
        style={{ boxShadow: "0 4px 24px #7C3AED60" }}
      >
        <Sparkles size={18} />
        Ask AI
      </button>

      {/* Job Detail Modal */}
      <JobDetailModal
        job={selectedJob}
        open={detailOpen}
        isSaved={selectedJob ? saved.has(selectedJob.id) : false}
        onClose={closeDetail}
        onSaveToggle={() => selectedJob && handleSaveToggle(selectedJob.id)}
        onCompanyFilter={handleCompanyFilter}
      />

      {/* AI Drawer */}
      <AiDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onSourceClick={(job) => {
          setAiOpen(false);
          // Small delay so AI drawer closes before detail opens
          setTimeout(() => {
            setSelectedJob(job as Job);
            setDetailOpen(true);
          }, 200);
        }}
      />
    </div>
  );
}
