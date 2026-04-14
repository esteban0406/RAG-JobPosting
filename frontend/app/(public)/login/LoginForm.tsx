"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { LoginSchema, type LoginInput } from "@/lib/schemas";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/jobs";

  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(LoginSchema) });

  async function onSubmit(data: LoginInput) {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.message ?? "Login failed");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      toast.error("Network error, please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="w-[420px] bg-bg-surface rounded-[var(--radius-lg)] border border-border p-10 flex flex-col gap-5"
      style={{ boxShadow: "0 0 80px #7C3AED30" }}
    >
      <span className="text-text-primary font-bold text-xl">⚡ JobAI</span>

      <div className="flex flex-col gap-1.5">
        <h1 className="text-text-primary text-2xl font-extrabold">Welcome back</h1>
        <p className="text-text-secondary text-[15px]">
          Enter your credentials to continue
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-text-primary text-sm font-medium">Email</label>
          <input
            {...register("email")}
            type="email"
            placeholder="you@example.com"
            className="h-11 px-3.5 bg-bg-base border border-border-subtle rounded-[var(--radius-sm)] text-text-primary text-sm outline-none focus:border-accent transition-colors w-full"
          />
          {errors.email && (
            <span className="text-danger text-xs">{errors.email.message}</span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-text-primary text-sm font-medium">Password</label>
            <span className="text-accent-glow text-sm cursor-pointer hover:underline">
              Forgot password?
            </span>
          </div>
          <div className="relative">
            <input
              {...register("password")}
              type={showPw ? "text" : "password"}
              placeholder="••••••••"
              className="h-11 px-3.5 pr-11 bg-bg-base border border-border-subtle rounded-[var(--radius-sm)] text-text-primary text-sm outline-none focus:border-accent transition-colors w-full"
            />
            <button
              type="button"
              onClick={() => setShowPw((p) => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.password && (
            <span className="text-danger text-xs">{errors.password.message}</span>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="h-11 bg-accent text-white font-semibold text-base rounded-[var(--radius-md)] hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
        >
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-text-muted text-sm">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <div className="flex items-center justify-center gap-1">
        <span className="text-text-secondary text-sm">Don&apos;t have an account?</span>
        <Link
          href="/register"
          className="text-accent-glow text-sm font-semibold hover:underline"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}
