"use client";

import { useCallback, useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { FilterPanel } from "./FilterPanel";

const FILTER_LABELS: Record<string, string> = {
  keyword: "Keyword",
  location: "Location",
  jobType: "Type",
  isRemote: "Remote",
  minSalary: "Min salary",
  maxSalary: "Max salary",
};

export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [keyword, setKeyword] = useState(searchParams.get("keyword") ?? "");
  const [showPanel, setShowPanel] = useState(false);

  // Push URL param update (debounced by keyword input)
  const pushParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") params.delete(k);
        else params.set(k, v);
      }
      params.delete("page"); // reset pagination on filter change
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  // Debounce keyword input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      pushParams({ keyword: keyword || null });
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeFilters = [
    "location",
    "jobType",
    "isRemote",
    "minSalary",
    "maxSalary",
  ].filter((k) => searchParams.has(k));

  function clearFilter(key: string) {
    pushParams({ [key]: null });
  }

  function clearAll() {
    setKeyword("");
    router.push(pathname);
  }

  return (
    <div className="flex flex-col">
      {/* Search + Filters button */}
      <div className="flex items-center gap-3 h-16 px-6 bg-bg-surface border-b border-border">
        <div className="flex items-center gap-2.5 flex-1 h-10 px-3.5 bg-bg-base border border-border-subtle rounded-[var(--radius-sm)] focus-within:border-accent transition-colors">
          <Search size={16} className="text-text-muted shrink-0" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Search jobs by title, skill, company…"
            className="flex-1 bg-transparent text-text-primary text-sm outline-none placeholder:text-text-muted"
          />
          {keyword && (
            <button
              onClick={() => setKeyword("")}
              className="text-text-muted hover:text-text-secondary"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setShowPanel((p) => !p)}
            className="flex items-center gap-2 h-10 px-4 bg-bg-surface-2 border border-border rounded-[var(--radius-sm)] text-text-primary text-sm hover:border-accent/50 transition-colors"
          >
            <SlidersHorizontal size={15} />
            Filters
            {activeFilters.length > 0 && (
              <span className="bg-accent text-white text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {activeFilters.length}
              </span>
            )}
          </button>

          {showPanel && (
            <FilterPanel
              searchParams={searchParams}
              onApply={(vals) => {
                pushParams(vals);
                setShowPanel(false);
              }}
              onClose={() => setShowPanel(false)}
            />
          )}
        </div>
      </div>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div className="flex items-center gap-2 px-6 py-2.5 flex-wrap">
          {activeFilters.map((key) => (
            <span
              key={key}
              className="flex items-center gap-1.5 bg-accent-subtle text-accent-glow text-xs font-medium px-3 py-1.5 rounded-full"
            >
              {key === "isRemote"
                ? FILTER_LABELS[key]
                : `${FILTER_LABELS[key]}: ${searchParams.get(key)}`}
              <button
                onClick={() => clearFilter(key)}
                className="hover:text-white"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <button
            onClick={clearAll}
            className="text-text-muted text-sm hover:text-text-secondary transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
