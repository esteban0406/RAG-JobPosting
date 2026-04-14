import { Suspense } from "react";
import { cookies } from "next/headers";
import { FilterBar } from "@/components/jobs/FilterBar";
import { JobsGrid } from "@/components/jobs/JobsGrid";
import { Skeleton } from "@/components/ui/skeleton";
import type { Job } from "@/components/jobs/JobCard";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

interface JobsResponse {
  jobs: Job[];
  total: number;
  page: number;
  limit: number;
}

async function fetchJobs(params: Record<string, string>): Promise<JobsResponse> {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) query.set(k, v);
  }

  const res = await fetch(`${API}/jobs?${query.toString()}`, {
    next: { tags: ["jobs"] },
  });

  if (!res.ok) return { jobs: [], total: 0, page: 1, limit: 20 };
  return res.json();
}

async function fetchSavedJobIds(): Promise<string[]> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth-token")?.value;
    if (!token) return [];
    const res = await fetch(`${API}/users/me/favorites`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { tags: ["favorites"] },
    });
    if (!res.ok) return [];
    const favorites: Job[] = await res.json();
    return favorites.map((f) => f.id);
  } catch {
    return [];
  }
}

interface PageProps {
  searchParams: Promise<Record<string, string>>;
}

function JobsSkeleton() {
  return (
    <div className="flex gap-4 px-6 py-4">
      <div className="flex flex-col gap-4 flex-1">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-[var(--radius-md)] bg-bg-surface" />
        ))}
      </div>
      <div className="flex flex-col gap-4 flex-1">
        {[4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-[var(--radius-md)] bg-bg-surface" />
        ))}
      </div>
    </div>
  );
}

async function JobsContent({ searchParams }: { searchParams: Record<string, string> }) {
  const page = Number(searchParams.page ?? 1);
  const limit = 20;

  const [{ jobs, total }, savedJobIds] = await Promise.all([
    fetchJobs({ ...searchParams, page: String(page), limit: String(limit) }),
    fetchSavedJobIds(),
  ]);
  
  return (
    <JobsGrid
      jobs={jobs}
      total={total}
      page={page}
      limit={limit}
      savedJobIds={savedJobIds}
    />
  );
}

export default async function JobsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <div className="flex flex-col h-full">
      {/* FilterBar uses useSearchParams — must be wrapped in Suspense */}
      <Suspense fallback={<div className="h-16 bg-bg-surface border-b border-border" />}>
        <FilterBar />
      </Suspense>
      <Suspense fallback={<JobsSkeleton />}>
        <JobsContent searchParams={params} />
      </Suspense>
    </div>
  );
}
