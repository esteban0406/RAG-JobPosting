"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Check, X, FileText, UploadCloud, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { ProfileSchema, type ProfileInput } from "@/lib/schemas";
import { fetchApi, uploadFile, ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { TagInput } from "./TagInput";
import type { UserProfile } from "@/lib/auth-store";

interface ProfileFormProps {
  user: UserProfile;
}

interface ParsedResume {
  name: string | null;
  email: string | null;
  location: string | null;
  summary: string | null;
  skills: string[];
  experience: { company: string; title: string; startDate: string | null; endDate: string | null; description: string }[];
  education: { institution: string; degree: string | null; field: string | null; graduationYear: string | null }[];
  certifications: string[];
}

const MAX_SIZE = 5 * 1024 * 1024;

function SectionHeader({
  title,
  onEdit,
}: {
  title: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-primary text-base font-bold">{title}</span>
      <button
        onClick={onEdit}
        className="text-text-muted hover:text-text-secondary transition-colors"
      >
        <Pencil size={16} />
      </button>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-bg-surface border border-border rounded-[var(--radius-sm)]">
      <span className="text-text-muted text-sm">{label}</span>
      <span className="text-text-primary text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

export function ProfileForm({ user }: ProfileFormProps) {
  const setUser = useAuthStore((s) => s.setUser);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resumeStatus, setResumeStatus] = useState<"loading" | "none" | "exists">("loading");
  const [uploadingResume, setUploadingResume] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } =
    useForm<ProfileInput>({
      resolver: zodResolver(ProfileSchema),
      defaultValues: {
        name: user.name,
        location: user.location ?? "",
        skills: user.skills,
        preferredFields: user.preferredFields,
      },
    });

  const skills = watch("skills");
  const preferredFields = watch("preferredFields");

  useEffect(() => {
    fetchApi<{ id: string } | null>("/resume")
      .then((data) => setResumeStatus(data ? "exists" : "none"))
      .catch(() => setResumeStatus("none"));
  }, []);

  async function onSubmit(data: ProfileInput) {
    setSaving(true);
    try {
      const updated = await fetchApi<UserProfile>("/users/me", {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      setUser(updated);
      reset({
        name: updated.name,
        location: updated.location ?? "",
        skills: updated.skills,
        preferredFields: updated.preferredFields,
      });
      setEditing(false);
      toast.success("Profile updated");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    reset({
      name: user.name,
      location: user.location ?? "",
      skills: user.skills,
      preferredFields: user.preferredFields,
    });
    setEditing(false);
  }

  function handleResumeButtonClick() {
    fileInputRef.current?.click();
  }

  async function handleResumeFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so same file can be re-selected
    e.target.value = "";

    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are accepted");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("File must be 5 MB or smaller");
      return;
    }

    setUploadingResume(true);
    try {
      const formData = new FormData();
      formData.append("resume", file);
      const parsed = await uploadFile<ParsedResume>("/resume/upload", formData);

      if (parsed.skills.length > 0) setValue("skills", parsed.skills);
      if (parsed.location) setValue("location", parsed.location);
      setEditing(true);
      setResumeStatus("exists");
      toast.success("Resume parsed — review and save your updated profile");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Upload failed";
      toast.error(msg);
    } finally {
      setUploadingResume(false);
    }
  }

  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const memberSince = new Date(user.createdAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-8">
      {/* Profile header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-5">
          <div className="w-[72px] h-[72px] rounded-full bg-accent flex items-center justify-center shrink-0">
            <span className="text-white text-2xl font-bold">{initials}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-text-primary text-xl font-bold">{user.name}</span>
            <span className="text-text-secondary text-sm">{user.email}</span>
            <span className="text-text-muted text-xs">Member since {memberSince}</span>
          </div>
        </div>

        {editing ? (
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-sm font-semibold rounded-[var(--radius-md)] hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              <Check size={14} />
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-4 py-2 border border-border text-text-secondary text-sm rounded-[var(--radius-md)] hover:bg-bg-surface-2 transition-colors"
            >
              <X size={14} />
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-2 px-[18px] py-[9px] bg-bg-surface border border-border text-text-secondary text-sm rounded-[var(--radius-md)] hover:border-accent/50 transition-colors"
          >
            <Pencil size={14} />
            Edit profile
          </button>
        )}
      </div>

      <div className="h-px bg-border" />

      {/* Personal info */}
      <div className="flex flex-col gap-4">
        <SectionHeader title="Personal Info" onEdit={() => setEditing(true)} />
        {editing ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-text-muted text-xs uppercase tracking-wide font-medium">Name</label>
              <input
                {...register("name")}
                className="h-11 px-4 bg-bg-surface border border-border rounded-[var(--radius-sm)] text-text-primary text-sm outline-none focus:border-accent transition-colors"
              />
              {errors.name && <span className="text-danger text-xs">{errors.name.message}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-text-muted text-xs uppercase tracking-wide font-medium">Location</label>
              <input
                {...register("location")}
                placeholder="e.g. San Francisco, CA"
                className="h-11 px-4 bg-bg-surface border border-border rounded-[var(--radius-sm)] text-text-primary text-sm outline-none focus:border-accent transition-colors"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <InfoRow label="Name" value={user.name} />
            <InfoRow label="Email" value={user.email} />
            <InfoRow label="Location" value={user.location ?? ""} />
          </div>
        )}
      </div>

      <div className="h-px bg-border" />

      {/* Skills */}
      <div className="flex flex-col gap-4">
        <SectionHeader title="Skills" onEdit={() => setEditing(true)} />
        {editing ? (
          <TagInput
            tags={skills ?? []}
            onChange={(tags) => setValue("skills", tags)}
            placeholder="e.g. React, Python, AWS…"
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {(user.skills ?? []).length === 0 ? (
              <span className="text-text-muted text-sm">No skills added</span>
            ) : (
              user.skills.map((s) => (
                <span
                  key={s}
                  className="bg-accent-subtle text-accent-glow text-sm px-3.5 py-1.5 rounded-full"
                >
                  {s}
                </span>
              ))
            )}
          </div>
        )}
      </div>

      <div className="h-px bg-border" />

      {/* Preferred fields */}
      <div className="flex flex-col gap-4">
        <SectionHeader title="Preferred Fields" onEdit={() => setEditing(true)} />
        {editing ? (
          <TagInput
            tags={preferredFields ?? []}
            onChange={(tags) => setValue("preferredFields", tags)}
            placeholder="e.g. Frontend, Data Science…"
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {(user.preferredFields ?? []).length === 0 ? (
              <span className="text-text-muted text-sm">No preferred fields added</span>
            ) : (
              user.preferredFields.map((f) => (
                <span
                  key={f}
                  className="bg-bg-surface-2 text-text-secondary text-sm px-3.5 py-1.5 rounded-full"
                >
                  {f}
                </span>
              ))
            )}
          </div>
        )}
      </div>

      <div className="h-px bg-border" />

      {/* Resume */}
      <div className="flex flex-col gap-4">
        <span className="text-text-primary text-base font-bold">Resume</span>

        <div className="flex items-center justify-between px-4 py-3 bg-bg-surface border border-border rounded-[var(--radius-sm)]">
          {resumeStatus === "loading" ? (
            <span className="text-text-muted text-sm">Checking…</span>
          ) : resumeStatus === "exists" ? (
            <div className="flex items-center gap-2 text-text-secondary text-sm">
              <CheckCircle2 size={15} className="text-accent shrink-0" />
              Resume on file
            </div>
          ) : (
            <div className="flex items-center gap-2 text-text-muted text-sm">
              <FileText size={15} className="shrink-0" />
              No resume uploaded
            </div>
          )}

          <button
            type="button"
            onClick={handleResumeButtonClick}
            disabled={uploadingResume}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-base border border-border-subtle text-text-secondary text-xs font-medium rounded-[var(--radius-sm)] hover:border-accent/50 transition-colors disabled:opacity-60"
          >
            <UploadCloud size={13} />
            {uploadingResume
              ? "Parsing…"
              : resumeStatus === "exists"
              ? "Update resume"
              : "Upload resume"}
          </button>
        </div>

        {resumeStatus !== "loading" && (
          <p className="text-text-muted text-xs -mt-2">
            Uploading will auto-fill your skills and location. PDF only · max 5 MB.
          </p>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleResumeFileChange}
      />
    </form>
  );
}
