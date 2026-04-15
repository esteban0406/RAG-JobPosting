import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { DeleteAccountDialog } from "@/components/profile/DeleteAccountDialog";
import type { UserProfile } from "@/lib/auth-store";
import type { Job } from "@/components/jobs/JobCard";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

async function getProfileData() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;
  if (!token) redirect("/login?next=/profile");

  const [userRes, favRes] = await Promise.all([
    fetch(`${API}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { tags: ["user"] },
    }),
    fetch(`${API}/users/me/favorites`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { tags: ["favorites"] },
    }),
  ]);

  if (userRes.status === 401) redirect("/login?next=/profile");
  if (!userRes.ok) throw new Error("Failed to load profile");

  const user: UserProfile = await userRes.json();
  const favorites: Job[] = favRes.ok ? await favRes.json() : [];

  return { user, favorites };
}

export default async function ProfilePage() {
  const { user } = await getProfileData();

  return (
    <div className="flex justify-center py-10 px-6">
      <div className="w-[680px] flex flex-col gap-8">
        {/* Profile header + personal info + skills + preferred fields */}
        <ProfileForm user={user} />

        <div className="h-px bg-border" />

        {/* Saved jobs */}
        <div className="flex flex-col gap-4 mt-6" id="saved">
          <span className="text-text-primary text-base font-bold">Saved Jobs</span>
          <Link href="/saved-jobs" className="text-accent hover:underline">
            View All Saved Jobs
          </Link>
        </div>

        <div className="h-px bg-border" />

        {/* Danger zone */}
        <div className="bg-bg-surface border border-[#EF444440] rounded-[var(--radius-md)] p-5 flex flex-col gap-3">
          <span className="text-danger text-sm font-bold">Danger Zone</span>
          <p className="text-text-muted text-sm leading-relaxed">
            Permanently delete your account and all saved data. This cannot be
            undone.
          </p>
          <DeleteAccountDialog />
        </div>
      </div>
    </div>
  );
}
