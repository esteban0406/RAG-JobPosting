import { Skeleton } from "@/components/ui/skeleton";

export default function SavedJobsLoading() {
  return (
    <div className="px-6 py-8 max-w-5xl mx-auto w-full">
      <Skeleton className="w-32 h-7 mb-6 rounded-[var(--radius-sm)] bg-bg-surface" />
      <Skeleton className="w-full h-12 mb-6 rounded-[var(--radius-md)] bg-bg-surface" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-28 rounded-[var(--radius-md)] bg-bg-surface" />
        ))}
      </div>
    </div>
  );
}
