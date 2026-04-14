"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { RegisterStep1Schema, type RegisterStep1Input } from "@/lib/schemas";

export default function RegisterStep1Page() {
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterStep1Input>({
    resolver: zodResolver(RegisterStep1Schema),
  });

  function onSubmit(data: RegisterStep1Input) {
    // Store Step 1 data in sessionStorage for Step 2 to pick up
    sessionStorage.setItem("reg-step1", JSON.stringify(data));
    router.push("/register/step2");
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center">
      <div
        className="w-[440px] bg-bg-surface rounded-[var(--radius-lg)] border border-border p-10 flex flex-col gap-5"
        style={{ boxShadow: "0 0 80px #7C3AED30" }}
      >
        {/* Brand */}
        <div className="flex items-center justify-between">
          <span className="text-text-primary font-bold text-xl">⚡ JobAI</span>
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent" />
            <div className="w-8 h-0.5 bg-accent" />
            <div className="w-2 h-2 rounded-full bg-border-subtle" />
            <span className="text-text-muted text-sm">Step 1 of 2</span>
          </div>
        </div>

        {/* Heading */}
        <div className="flex flex-col gap-1">
          <h1 className="text-text-primary text-2xl font-extrabold">
            Create your account
          </h1>
          <p className="text-text-secondary text-[15px]">
            Enter your details to get started
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-text-primary text-sm font-medium">
              Full Name
            </label>
            <input
              {...register("name")}
              placeholder="Jane Smith"
              className="h-11 px-3.5 bg-bg-base border border-border-subtle rounded-[var(--radius-sm)] text-text-primary text-sm outline-none focus:border-accent transition-colors w-full"
            />
            {errors.name && (
              <span className="text-danger text-xs">{errors.name.message}</span>
            )}
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label className="text-text-primary text-sm font-medium">
              Email
            </label>
            <input
              {...register("email")}
              type="email"
              placeholder="you@example.com"
              className="h-11 px-3.5 bg-bg-base border border-border-subtle rounded-[var(--radius-sm)] text-text-primary text-sm outline-none focus:border-accent transition-colors w-full"
            />
            {errors.email && (
              <span className="text-danger text-xs">
                {errors.email.message}
              </span>
            )}
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-text-primary text-sm font-medium">
              Password
            </label>
            <div className="relative">
              <input
                {...register("password")}
                type={showPw ? "text" : "password"}
                placeholder="Min. 8 characters"
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
              <span className="text-danger text-xs">
                {errors.password.message}
              </span>
            )}
          </div>

          <button
            type="submit"
            className="h-11 bg-accent text-white font-semibold text-base rounded-[var(--radius-md)] hover:opacity-90 transition-opacity cursor-pointer"
          >
            Continue →
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
