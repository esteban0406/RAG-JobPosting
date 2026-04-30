"use client";

import { useRef, useEffect, useState } from "react";
import { X } from "lucide-react";

const JOB_TYPES = [
  { value: "", label: "Any" },
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
  { value: "freelance", label: "Freelance" },
];

interface FilterPanelProps {
  searchParams: URLSearchParams;
  onApply: (values: Record<string, string | null>) => void;
  onClose: () => void;
}

export function FilterPanel({
  searchParams,
  onApply,
  onClose,
}: FilterPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [location, setLocation] = useState(searchParams.get("location") ?? "");
  const [jobType, setJobType] = useState(searchParams.get("jobType") ?? "");
  const [isRemote, setIsRemote] = useState(
    searchParams.get("isRemote") === "true",
  );
  const [minSalary, setMinSalary] = useState(
    searchParams.get("minSalary") ?? "",
  );
  const [maxSalary, setMaxSalary] = useState(
    searchParams.get("maxSalary") ?? "",
  );

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  function handleApply() {
    onApply({
      location: location || null,
      jobType: jobType || null,
      isRemote: isRemote ? "true" : null,
      minSalary: minSalary || null,
      maxSalary: maxSalary || null,
    });
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-12 z-20 w-72 bg-bg-surface border border-border rounded-[var(--radius-lg)] shadow-xl p-5 flex flex-col gap-4"
    >
      <div className="flex items-center justify-between">
        <span className="text-text-primary font-semibold text-sm">Filters</span>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-secondary"
        >
          <X size={16} />
        </button>
      </div>

      {/* Location */}
      <div className="flex flex-col gap-1.5">
        <label className="text-text-secondary text-xs font-medium uppercase tracking-wide">
          Location
        </label>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Remote, New York"
          className="h-9 px-3 bg-bg-base border border-border-subtle rounded-[var(--radius-sm)] text-text-primary text-sm outline-none focus:border-accent transition-colors"
        />
      </div>

      {/* Job type */}
      <div className="flex flex-col gap-1.5">
        <label className="text-text-secondary text-xs font-medium uppercase tracking-wide">
          Job Type
        </label>
        <select
          value={jobType}
          onChange={(e) => setJobType(e.target.value)}
          className="h-9 px-3 bg-bg-base border border-border-subtle rounded-[var(--radius-sm)] text-text-primary text-sm outline-none focus:border-accent transition-colors appearance-none"
        >
          {JOB_TYPES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Remote toggle */}
      <label className="flex items-center justify-between cursor-pointer">
        <span className="text-text-secondary text-xs font-medium uppercase tracking-wide">
          Remote only
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={isRemote}
          onClick={() => setIsRemote((v) => !v)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            isRemote
              ? "bg-accent"
              : "bg-bg-surface-2 border border-border-subtle"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
              isRemote ? "translate-x-4.5" : "translate-x-0.5"
            }`}
          />
        </button>
      </label>

      {/* Salary range */}
      <div className="flex flex-col gap-1.5">
        <label className="text-text-secondary text-xs font-medium uppercase tracking-wide">
          Salary Range (USD/year)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={minSalary}
            onChange={(e) => setMinSalary(e.target.value)}
            placeholder="Min"
            className="min-w-0 flex-1 h-9 px-3 bg-bg-base border border-border-subtle rounded-[var(--radius-sm)] text-text-primary text-sm outline-none focus:border-accent transition-colors"
          />
          <span className="text-text-muted text-sm shrink-0">–</span>
          <input
            type="number"
            value={maxSalary}
            onChange={(e) => setMaxSalary(e.target.value)}
            placeholder="Max"
            className="min-w-0 flex-1 h-9 px-3 bg-bg-base border border-border-subtle rounded-[var(--radius-sm)] text-text-primary text-sm outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>

      <button
        onClick={handleApply}
        className="h-9 bg-accent text-white font-semibold text-sm rounded-[var(--radius-md)] hover:opacity-90 transition-opacity cursor-pointer"
      >
        Apply filters
      </button>
    </div>
  );
}
