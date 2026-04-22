"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { UploadCloud, FileText, X } from "lucide-react";
import { uploadFile, ApiError } from "@/lib/api";

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

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export default function RegisterStep2Page() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const step1 = sessionStorage.getItem("reg-step1");
    if (!step1) router.replace("/register");
  }, [router]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) return;
    if (picked.type !== "application/pdf") {
      toast.error("Only PDF files are accepted");
      return;
    }
    if (picked.size > MAX_SIZE) {
      toast.error("File must be 5 MB or smaller");
      return;
    }
    setFile(picked);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const picked = e.dataTransfer.files[0];
    if (!picked) return;
    if (picked.type !== "application/pdf") {
      toast.error("Only PDF files are accepted");
      return;
    }
    if (picked.size > MAX_SIZE) {
      toast.error("File must be 5 MB or smaller");
      return;
    }
    setFile(picked);
  }

  async function register(extraData?: object) {
    const step1Raw = sessionStorage.getItem("reg-step1");
    if (!step1Raw) { router.replace("/register"); return false; }
    const step1 = JSON.parse(step1Raw);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...step1, ...extraData }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error((err as { message?: string }).message ?? "Registration failed");
      return false;
    }
    return true;
  }

  async function onSubmit() {
    if (!file) return;
    setLoading(true);
    try {
      const ok = await register();
      if (!ok) return;

      const formData = new FormData();
      formData.append("resume", file);
      try {
        await uploadFile<ParsedResume>("/resume/upload", formData);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "Resume upload failed";
        toast.warning(`Account created, but ${msg}. You can upload your resume from your profile.`);
      }

      sessionStorage.removeItem("reg-step1");
      router.push("/jobs");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function onSkip() {
    setLoading(true);
    try {
      const ok = await register();
      if (!ok) return;
      sessionStorage.removeItem("reg-step1");
      router.push("/jobs");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const hasFile = file !== null;

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
            Upload your resume
          </h1>
          <p className="text-text-secondary text-[15px]">
            Our AI will extract your skills and experience to personalise job recommendations
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => !hasFile && fileInputRef.current?.click()}
          className={[
            "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-md)] border-2 border-dashed p-8 transition-colors",
            hasFile
              ? "border-accent bg-accent-subtle cursor-default"
              : "border-border-subtle bg-bg-base hover:border-accent/50 cursor-pointer",
          ].join(" ")}
        >
          {hasFile ? (
            <>
              <FileText size={32} className="text-accent" />
              <div className="flex flex-col items-center gap-0.5 text-center">
                <span className="text-text-primary text-sm font-medium">{file.name}</span>
                <span className="text-text-muted text-xs">
                  {(file.size / 1024).toFixed(0)} KB
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                className="flex items-center gap-1 text-text-muted hover:text-danger text-xs transition-colors mt-1"
              >
                <X size={12} />
                Remove
              </button>
            </>
          ) : (
            <>
              <UploadCloud size={32} className="text-text-muted" />
              <div className="flex flex-col items-center gap-0.5 text-center">
                <span className="text-text-secondary text-sm font-medium">
                  Drag &amp; drop or click to browse
                </span>
                <span className="text-text-muted text-xs">PDF only · max 5 MB</span>
              </div>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />

        <button
          type="button"
          onClick={onSubmit}
          disabled={!hasFile || loading}
          className="h-11 bg-accent text-white font-semibold text-base rounded-[var(--radius-md)] hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
        >
          {loading ? "Setting up your account…" : "Finish setup"}
        </button>

        <button
          type="button"
          onClick={onSkip}
          disabled={loading}
          className="h-11 border border-border-subtle text-text-secondary font-semibold text-base rounded-[var(--radius-md)] hover:bg-bg-surface-2 transition-colors disabled:opacity-60 cursor-pointer"
        >
          Skip for now
        </button>

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
