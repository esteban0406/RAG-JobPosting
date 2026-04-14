"use client";

import { Banknote, ExternalLink, Bookmark, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { Job } from "./JobCard";

const JOB_TYPE_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  remote: "Remote",
};

function formatSalary(min: number | null, max: number | null) {
  if (!min && !max) return null;
  const fmt = (n: number) =>
    n >= 1000 ? `$${Math.round(n / 1000).toLocaleString()}k` : `$${n}`;
  if (min && max) return `${fmt(min)} – ${fmt(max)} / year`;
  if (min) return `from ${fmt(min)} / year`;
  return `up to ${fmt(max!)} / year`;
}

interface JobDetailDrawerProps {
  job: Job | null;
  open: boolean;
  isSaved?: boolean;
  onClose: () => void;
  onSaveToggle?: () => void;
  onCompanyFilter?: (company: string) => void;
}

export function JobDetailDrawer({
  job,
  open,
  isSaved,
  onClose,
  onSaveToggle,
  onCompanyFilter,
}: JobDetailDrawerProps) {
  if (!job) return null;

  const salary = formatSalary(job.minSalary, job.maxSalary);
  const isRemote = job.jobType === "remote";

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-[560px] max-w-full bg-bg-surface border-l border-border p-0 flex flex-col overflow-hidden [&>button]:hidden"
      >
        {/* Top section */}
        <div className="flex flex-col gap-4 px-6 py-6 border-b border-border">
          <SheetHeader className="p-0">
            {/* Title row */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <SheetTitle className="text-text-primary text-xl font-bold leading-snug text-left">
                  {job.title}
                </SheetTitle>
                <span className="text-text-secondary text-sm">{job.company}</span>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center bg-bg-surface-2 rounded-[var(--radius-sm)] text-text-muted hover:text-text-primary transition-colors shrink-0 mt-0.5"
              >
                <X size={16} />
              </button>
            </div>
          </SheetHeader>

          {/* Meta badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {job.location && (
              <span className="flex items-center gap-1.5 bg-bg-surface-2 text-text-secondary text-xs font-medium px-3 py-1.5 rounded-full">
                {job.location}
              </span>
            )}
            {job.jobType && (
              <span
                className={cn(
                  "text-xs font-medium px-3 py-1.5 rounded-full",
                  isRemote
                    ? "bg-badge-remote text-[#6EE7B7]"
                    : "bg-badge-fulltime text-[#93C5FD]",
                )}
              >
                {JOB_TYPE_LABELS[job.jobType] ?? job.jobType}
              </span>
            )}
            <span className="bg-bg-surface-2 text-text-muted text-xs font-medium px-3 py-1.5 rounded-full">
              via {job.source}
            </span>
          </div>

          {/* Salary */}
          {salary && (
            <div className="flex items-center gap-2">
              <Banknote size={16} className="text-success" />
              <span className="text-success text-[15px] font-semibold">{salary}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 h-10 bg-accent text-white font-semibold text-sm rounded-[var(--radius-md)] hover:opacity-90 transition-opacity"
            >
              <ExternalLink size={15} />
              Apply Now
            </a>
            <button
              onClick={onSaveToggle}
              className={cn(
                "flex items-center gap-2 px-5 h-10 border rounded-[var(--radius-md)] font-semibold text-sm transition-colors",
                isSaved
                  ? "border-accent text-accent bg-accent-subtle"
                  : "border-border-subtle text-text-secondary hover:border-accent hover:text-accent",
              )}
            >
              <Bookmark size={15} className={isSaved ? "fill-accent" : ""} />
              {isSaved ? "Saved" : "Save"}
            </button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-5 p-6">
          {/* Description */}
          <div className="flex flex-col gap-3">
            <h3 className="text-text-primary font-bold text-base">About the role</h3>
            <p className="text-text-secondary text-sm leading-[1.7] whitespace-pre-line">
              {job.description}
            </p>
          </div>

          {/* More from company */}
          <div className="h-px bg-border" />
          <button
            onClick={() => {
              onCompanyFilter?.(job.company);
              onClose();
            }}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-accent-glow transition-colors"
          >
            <span>More jobs from {job.company}</span>
            <span className="text-accent-glow">→</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
