import { Skeleton } from "@/components/ui/skeleton";

export default function JobsLoading() {
  return (
    <div className="flex flex-col h-full">
      {/* Fake filter bar */}
      <div className="h-16 px-6 flex items-center gap-3 bg-bg-surface border-b border-border">
        <Skeleton className="flex-1 h-10 rounded-[var(--radius-sm)] bg-bg-surface-2" />
        <Skeleton className="w-24 h-10 rounded-[var(--radius-sm)] bg-bg-surface-2" />
      </div>
      {/* Fake card grid */}
      <div className="flex gap-4 px-6 pt-4">
        <div className="flex flex-col gap-4 flex-1">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-[var(--radius-md)] bg-bg-surface" />
          ))}
        </div>
        <div className="flex flex-col gap-4 flex-1">
          {[5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-28 rounded-[var(--radius-md)] bg-bg-surface" />
          ))}
        </div>
      </div>
    </div>
  );
}
