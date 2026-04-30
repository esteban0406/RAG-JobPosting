"use client";

import { Banknote, ExternalLink, Bookmark, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { type Job, JobTypeBadge, RemoteBadge } from "./JobCard";

const JOB_TYPE_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  freelance: "Freelance",
};

function formatSalary(min: number | null, max: number | null) {
  if (!min && !max) return null;
  const fmt = (n: number) =>
    n >= 1000 ? `$${Math.round(n / 1000).toLocaleString()}k` : `$${n}`;
  if (min && max) return `${fmt(min)} – ${fmt(max)} / year`;
  if (min) return `from ${fmt(min)} / year`;
  return `up to ${fmt(max!)} / year`;
}

interface JobDetailModalProps {
  job: Job | null;
  open: boolean;
  isSaved?: boolean;
  onClose: () => void;
  onSaveToggle?: () => void;
  onCompanyFilter?: (company: string) => void;
}

export function JobDetailModal({
  job,
  open,
  isSaved,
  onClose,
  onSaveToggle,
  onCompanyFilter,
}: JobDetailModalProps) {
  if (!job) return null;

  const salary = formatSalary(job.minSalary, job.maxSalary);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="max-w-[60vw] max-h-[90vh] w-full bg-bg-surface border-border p-0 flex flex-col overflow-hidden [&>button]:hidden"
      >
        {/* Fixed header */}
        <div className="flex flex-col gap-4 px-6 py-6 border-b border-border">
          {/* Title row */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1 min-w-0">
              <DialogTitle className="text-text-primary text-xl font-bold leading-snug text-left">
                {job.title}
              </DialogTitle>
              <span className="text-text-secondary text-sm">{job.company}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 mt-0.5">
              {job.logo && (
                <div className="w-10 h-10 rounded-md bg-bg-surface-2 flex items-center justify-center overflow-hidden">
                  <img
                    src={job.logo}
                    alt={`${job.company} logo`}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      const el = e.currentTarget;
                      if (el.parentElement)
                        el.parentElement.style.display = "none";
                    }}
                  />
                </div>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center bg-bg-surface-2 rounded-[var(--radius-sm)] text-text-muted hover:text-text-primary transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Meta badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {job.location && (
              <span className="bg-bg-surface-2 text-text-secondary text-xs font-medium px-3 py-1.5 rounded-full">
                {job.location}
              </span>
            )}
            {job.isRemote && <RemoteBadge />}
            {job.jobType && <JobTypeBadge type={job.jobType} />}
          </div>

          {/* Salary */}
          {salary && (
            <div className="flex items-center gap-2">
              <Banknote size={16} className="text-success" />
              <span className="text-success text-[15px] font-semibold">
                {salary}
              </span>
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

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-5 p-6">
          {/* About the role */}
          <div className="flex flex-col gap-3">
            {job.summary ? (
              <>
                <h3 className="text-text-primary font-bold text-base">
                  About the role
                </h3>
                <p className="text-text-primary text-sm font-medium leading-[1.7]">
                  {job.summary}
                </p>
              </>
            ) : null}
          </div>
          {/*Skills */}
          {job.skills?.length > 0 && (
            <>
              <div className="h-px bg-border" />
              <div className="flex flex-col gap-3">
                <h3 className="text-text-primary font-bold text-base">
                  Skills
                </h3>
                <div className="flex flex-wrap gap-2">
                  {job.skills.map((skill, i) => (
                    <span
                      key={i}
                      className="bg-bg-surface-2 text-text-secondary text-xs font-medium px-3 py-1.5 rounded-full"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Responsibilities */}
          {job.responsibilities?.length > 0 && (
            <>
              <div className="h-px bg-border" />
              <div className="flex flex-col gap-3">
                <h3 className="text-text-primary font-bold text-base">
                  Responsibilities
                </h3>
                <ul className="flex flex-col gap-1.5 pl-4 list-disc">
                  {job.responsibilities.map((item, i) => (
                    <li
                      key={i}
                      className="text-text-secondary text-sm leading-[1.7]"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* Requirements */}
          {job.requirements?.length > 0 && (
            <>
              <div className="h-px bg-border" />
              <div className="flex flex-col gap-3">
                <h3 className="text-text-primary font-bold text-base">
                  Requirements
                </h3>
                <ul className="flex flex-col gap-1.5 pl-4 list-disc">
                  {job.requirements.map((item, i) => (
                    <li
                      key={i}
                      className="text-text-secondary text-sm leading-[1.7]"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* Benefits */}
          {job.benefits?.length > 0 && (
            <>
              <div className="h-px bg-border" />
              <div className="flex flex-col gap-3">
                <h3 className="text-text-primary font-bold text-base">
                  Benefits
                </h3>
                <ul className="flex flex-col gap-1.5 pl-4 list-disc">
                  {job.benefits.map((item, i) => (
                    <li
                      key={i}
                      className="text-text-secondary text-sm leading-[1.7]"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* Description */}
          <h3 className="text-text-primary font-bold text-base">
            Job description
          </h3>
          <p className="text-text-secondary text-sm leading-[1.7] whitespace-pre-line">
            {job.description}
          </p>

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
      </DialogContent>
    </Dialog>
  );
}
