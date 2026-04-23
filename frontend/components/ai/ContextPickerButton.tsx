"use client";

import { useState, useEffect } from "react";
import { Briefcase, X } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useAiStore } from "@/lib/ai-store";
import type { Job } from "@/components/jobs/JobCard";

interface ContextPickerButtonProps {
  isLoggedIn?: boolean;
}

export function ContextPickerButton({ isLoggedIn }: ContextPickerButtonProps) {
  const { contextJobIds, toggleContextJob, clearContext } = useAiStore();
  const [open, setOpen] = useState(false);
  const [savedJobs, setSavedJobs] = useState<Job[]>([]);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchApi<Job[]>("/users/me/favorites")
      .then(setSavedJobs)
      .catch(() => {});
  }, [isLoggedIn]);

  if (!isLoggedIn) return null;

  const count = contextJobIds.size;

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Add jobs to context"
        className="w-8 h-8 flex items-center justify-center rounded-[var(--radius-sm)] text-text-muted hover:text-text-primary hover:bg-bg-surface-2 transition-colors relative"
      >
        <Briefcase size={16} />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center bg-accent text-white text-[10px] font-bold rounded-full">
            {count}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          {/* Popover */}
          <div className="absolute bottom-full mb-2 left-0 z-20 w-72 bg-bg-surface border border-border rounded-[var(--radius-md)] shadow-lg flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
              <span className="text-text-primary text-xs font-semibold">
                Add jobs to context
              </span>
              <button
                onClick={() => setOpen(false)}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {savedJobs.length === 0 ? (
              <p className="text-text-muted text-xs px-3 py-4 text-center">
                No saved jobs yet.
              </p>
            ) : (
              <div className="overflow-y-auto max-h-60">
                {savedJobs.map((job) => {
                  const checked = contextJobIds.has(job.id);
                  return (
                    <label
                      key={job.id}
                      className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-bg-surface-2 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleContextJob(job.id)}
                        className="mt-0.5 accent-[var(--color-accent)] shrink-0"
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="text-text-primary text-xs font-medium leading-tight truncate">
                          {job.title}
                        </span>
                        <span className="text-text-muted text-[11px] truncate">
                          {job.company}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {count > 0 && (
              <div className="border-t border-border px-3 py-2">
                <button
                  onClick={clearContext}
                  className="text-text-muted text-xs hover:text-text-primary transition-colors"
                >
                  Clear all ({count})
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
