import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <div className="flex justify-center py-10 px-6">
      <div className="w-[680px] flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center gap-5">
          <Skeleton className="w-[72px] h-[72px] rounded-full bg-bg-surface" />
          <div className="flex flex-col gap-2">
            <Skeleton className="w-36 h-5 rounded bg-bg-surface" />
            <Skeleton className="w-48 h-4 rounded bg-bg-surface" />
          </div>
        </div>
        <Skeleton className="h-px bg-bg-surface" />
        {/* Sections */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-3">
            <Skeleton className="w-28 h-5 rounded bg-bg-surface" />
            <Skeleton className="h-11 rounded-[var(--radius-sm)] bg-bg-surface" />
          </div>
        ))}
      </div>
    </div>
  );
}
