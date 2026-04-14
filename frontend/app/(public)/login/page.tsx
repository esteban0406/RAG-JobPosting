import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center">
      <Suspense
        fallback={
          <div className="w-[420px] h-80 bg-bg-surface border border-border rounded-[var(--radius-lg)] animate-pulse" />
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
