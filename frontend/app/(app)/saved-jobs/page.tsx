import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Job } from "@/components/jobs/JobCard";
import { SavedJobsGrid } from "@/components/saved-jobs/SavedJobsGrid";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth-cookies";

const API = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:4000/api/v1";

async function getSavedJobs(): Promise<Job[]> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) redirect("/login?next=/saved-jobs");

  const res = await fetch(`${API}/users/me/favorites`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { tags: ["favorites"] },
  });

  if (res.status === 401) redirect("/login?next=/saved-jobs");
  if (!res.ok) return [];

  return res.json();
}

export default async function SavedJobsPage() {
  const favorites = await getSavedJobs();

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto w-full">
      <h1 className="text-text-primary text-xl font-bold mb-6">Saved Jobs</h1>
      <SavedJobsGrid initialJobs={favorites} />
    </div>
  );
}
