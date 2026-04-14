"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { RegisterStep2Schema, type RegisterStep2Input } from "@/lib/schemas";
import { TagInput } from "@/components/profile/TagInput";

export default function RegisterStep2Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const { handleSubmit, setValue, watch } = useForm<RegisterStep2Input>({
    resolver: zodResolver(RegisterStep2Schema),
    defaultValues: { skills: [], preferredFields: [], location: "" },
  });

  const skills = watch("skills");
  const preferredFields = watch("preferredFields");

  // If Step 1 data is missing, redirect back
  useEffect(() => {
    const step1 = sessionStorage.getItem("reg-step1");
    if (!step1) router.replace("/register");
  }, [router]);

  async function onSubmit(data: RegisterStep2Input) {
    const step1Raw = sessionStorage.getItem("reg-step1");
    if (!step1Raw) {
      router.replace("/register");
      return;
    }
    const step1 = JSON.parse(step1Raw);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...step1, ...data }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.message ?? "Registration failed");
        return;
      }
      sessionStorage.removeItem("reg-step1");
      router.push("/jobs");
      router.refresh();
    } catch {
      toast.error("Network error, please try again");
    } finally {
      setLoading(false);
    }
  }

  async function onSkip() {
    const step1Raw = sessionStorage.getItem("reg-step1");
    if (!step1Raw) { router.replace("/register"); return; }
    const step1 = JSON.parse(step1Raw);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(step1),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.message ?? "Registration failed");
        return;
      }
      sessionStorage.removeItem("reg-step1");
      router.push("/jobs");
      router.refresh();
    } catch {
      toast.error("Network error, please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center">
      <div
        className="w-[440px] bg-bg-surface rounded-[var(--radius-lg)] border border-border p-10 flex flex-col gap-5"
        style={{ boxShadow: "0 0 80px #7C3AED30" }}
      >
        {/* Brand + step indicator */}
        <div className="flex items-center justify-between">
          <span className="text-text-primary font-bold text-xl">⚡ JobAI</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent" />
            <div className="w-8 h-0.5 bg-accent" />
            <div className="w-2 h-2 rounded-full bg-accent" />
            <span className="text-text-muted text-sm">Step 2 of 2</span>
          </div>
        </div>

        {/* Heading */}
        <div className="flex flex-col gap-1">
          <h1 className="text-text-primary text-2xl font-extrabold">
            Tell us about yourself
          </h1>
          <p className="text-text-secondary text-[15px]">
            This helps us surface better jobs for you
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          {/* Skills */}
          <div className="flex flex-col gap-1.5">
            <label className="text-text-primary text-sm font-medium">
              Skills
            </label>
            <TagInput
              tags={skills ?? []}
              onChange={(tags) => setValue("skills", tags)}
              placeholder="e.g. React, Python, AWS…"
            />
          </div>

          {/* Preferred Fields */}
          <div className="flex flex-col gap-1.5">
            <label className="text-text-primary text-sm font-medium">
              Preferred Fields
            </label>
            <TagInput
              tags={preferredFields ?? []}
              onChange={(tags) => setValue("preferredFields", tags)}
              placeholder="e.g. Frontend, Data Science…"
            />
          </div>

          {/* Location */}
          <div className="flex flex-col gap-1.5">
            <label className="text-text-primary text-sm font-medium">
              Location
            </label>
            <input
              onChange={(e) => setValue("location", e.target.value)}
              placeholder="e.g. San Francisco, Remote"
              className="h-11 px-3.5 bg-bg-base border border-border-subtle rounded-[var(--radius-sm)] text-text-primary text-sm outline-none focus:border-accent transition-colors w-full"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="h-11 bg-accent text-white font-semibold text-base rounded-[var(--radius-md)] hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
          >
            {loading ? "Creating account…" : "Finish setup"}
          </button>

          <button
            type="button"
            onClick={onSkip}
            disabled={loading}
            className="h-11 border border-border-subtle text-text-secondary font-semibold text-base rounded-[var(--radius-md)] hover:bg-bg-surface-2 transition-colors disabled:opacity-60 cursor-pointer"
          >
            Skip for now
          </button>
        </form>

        <div className="flex items-center justify-center gap-1">
          <span className="text-text-secondary text-sm">
            Already have an account?
          </span>
          <Link
            href="/login"
            className="text-accent-glow text-sm font-semibold hover:underline"
          >
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
