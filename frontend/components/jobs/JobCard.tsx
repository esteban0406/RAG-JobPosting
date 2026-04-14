import { Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string | null;
  jobType: string | null;
  minSalary: number | null;
  maxSalary: number | null;
  source: string;
  url: string;
  description: string;
}

const JOB_TYPE_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
  remote: "Remote",
};

function SalaryRange({ min, max }: { min: number | null; max: number | null }) {
  if (!min && !max) return null;
  const fmt = (n: number) =>
    n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
  if (min && max) return <span>{fmt(min)}–{fmt(max)}</span>;
  if (min) return <span>from {fmt(min)}</span>;
  return <span>up to {fmt(max!)}</span>;
}

function JobTypeBadge({ type }: { type: string }) {
  const isRemote = type === "remote";
  return (
    <span
      className={cn(
        "text-xs font-medium px-2.5 py-1 rounded-full",
        isRemote
          ? "bg-badge-remote text-[#6EE7B7]"
          : "bg-badge-fulltime text-[#93C5FD]",
      )}
    >
      {JOB_TYPE_LABELS[type] ?? type}
    </span>
  );
}

interface JobCardProps {
  job: Job;
  isSaved?: boolean;
  onClick?: () => void;
  onSaveToggle?: () => void;
}

export function JobCard({ job, isSaved, onClick, onSaveToggle }: JobCardProps) {
  const salary = <SalaryRange min={job.minSalary} max={job.maxSalary} />;

  return (
    <div
      onClick={onClick}
      className="bg-bg-surface border border-border rounded-[var(--radius-md)] p-5 flex flex-col gap-3 cursor-pointer hover:border-accent/50 transition-colors group"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <span className="text-text-primary font-bold text-base leading-snug group-hover:text-accent-glow transition-colors">
          {job.title}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSaveToggle?.();
          }}
          className="shrink-0 ml-2 mt-0.5 hover:scale-110 transition-transform"
          title={isSaved ? "Unsave job" : "Save job"}
        >
          <Bookmark
            size={18}
            className={cn(
              "transition-colors",
              isSaved ? "fill-accent text-accent" : "text-text-muted hover:text-accent",
            )}
          />
        </button>
      </div>

      {/* Company · Location · Salary */}
      <span className="text-text-secondary text-sm">
        {job.company}
        {job.location ? ` · ${job.location}` : ""}
        {salary ? " · " : ""}
        {salary}
      </span>

      {/* Footer badges */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {job.jobType && <JobTypeBadge type={job.jobType} />}
        </div>
        <span className="text-text-muted text-xs">via {job.source}</span>
      </div>
    </div>
  );
}
