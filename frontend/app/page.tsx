import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Globe, Layers, Database, Sparkles } from "lucide-react";

const PROVIDERS = [
  { icon: Globe, name: "Remotive", desc: "Remote-only positions" },
  { icon: Layers, name: "Jobicy", desc: "Remote by industry" },
  { icon: Database, name: "FindWork", desc: "Aggregated job listings" },
];

const HOW_IT_WORKS = [
  {
    n: "1",
    title: "Browse Jobs",
    desc: "Explore thousands of listings from 3 providers, filtered by role, location, and salary.",
  },
  {
    n: "2",
    title: "Ask AI",
    desc: "Ask natural-language questions — the RAG engine retrieves jobs and generates precise answers.",
  },
  {
    n: "3",
    title: "Apply",
    desc: "Click Apply Now to go directly to the job. Save favorites to revisit later.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-bg-base text-text-primary">
      <Navbar />

      {/* Hero */}
      <section
        className="flex flex-col items-center justify-center gap-6 px-[200px] py-[60px] min-h-[640px] text-center relative overflow-hidden"
        style={{
          background:
            "radial-gradient(70% 80% at 50% 0%, #7C3AED8C 0%, transparent 100%), var(--color-bg-base)",
        }}
      >
        <span className="text-accent-glow text-xs font-semibold tracking-[2px] uppercase">
          AI-Powered Job Search
        </span>
        <h1 className="text-[68px] font-extrabold leading-[1.1] text-text-primary max-w-[800px]">
          Find your next role,
          <br />
          powered by AI.
        </h1>
        <p className="text-text-secondary text-[17px] leading-[1.65] max-w-[560px]">
          Aggregate jobs from 3 providers — Remotive, Jobicy, FindWork — with an
          AI assistant that understands what you actually need.
        </p>

        {/* CTAs */}
        <div className="flex items-center gap-4">
          <Link
            href="/jobs"
            className="bg-accent text-white font-semibold text-base px-7 py-3.5 rounded-[var(--radius-md)] hover:opacity-90 transition-opacity"
          >
            Browse Jobs
          </Link>
          <Link
            href="/jobs"
            className="border border-border-subtle text-text-primary font-semibold text-base px-7 py-3.5 rounded-[var(--radius-md)] hover:bg-bg-surface transition-colors"
          >
            Ask AI →
          </Link>
        </div>

        {/* Stats */}
        <div className="flex items-center mt-2">
          <div className="flex flex-col items-center gap-1 px-10 py-6">
            <span className="text-text-primary text-[32px] font-bold">3</span>
            <span className="text-text-muted text-sm">Job Providers</span>
          </div>
          <div className="w-px h-10 bg-border" />
          <div className="flex flex-col items-center gap-1 px-10 py-6">
            <span className="text-text-primary text-[32px] font-bold">5K+</span>
            <span className="text-text-muted text-sm">Live Jobs</span>
          </div>
          <div className="w-px h-10 bg-border" />
          <div className="flex flex-col items-center gap-1 px-10 py-6">
            <span className="text-accent-glow text-[32px] font-bold">RAG</span>
            <span className="text-text-muted text-sm">AI Powered</span>
          </div>
        </div>
      </section>

      {/* Providers */}
      <section className="bg-bg-surface flex flex-col items-center gap-10 p-20">
        <span className="text-text-muted text-xs font-semibold tracking-[2px] uppercase">
          Aggregating from trusted sources
        </span>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          {PROVIDERS.map(({ icon: Icon, name, desc }) => (
            <div
              key={name}
              className="w-[248px] flex flex-col items-center gap-3 p-5 bg-bg-base border border-border rounded-[var(--radius-md)]"
            >
              <Icon size={28} className="text-accent" />
              <span className="text-text-primary font-bold text-base">
                {name}
              </span>
              <span className="text-text-muted text-sm text-center">
                {desc}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* AI Section */}
      <section className="bg-bg-base flex items-center gap-20 px-[120px] py-20">
        {/* Left */}
        <div className="flex flex-col gap-6 flex-1">
          <span className="text-accent-glow text-xs font-semibold tracking-[2px] uppercase">
            Intelligent Search
          </span>
          <h2 className="text-text-primary text-[42px] font-extrabold leading-[1.2]">
            An AI assistant that
            <br />
            understands your needs.
          </h2>
          <p className="text-text-secondary text-base leading-[1.65]">
            Ask natural questions. The RAG engine retrieves jobs and synthesizes
            precise answers — from simple job searches to salary statistics.
          </p>
          <div className="flex flex-col gap-4">
            {[
              "Natural language job search",
              "Salary & location aggregation",
              "Source-grounded answers",
            ].map((feat) => (
              <div key={feat} className="flex items-center gap-3">
                <Sparkles size={16} className="text-accent shrink-0" />
                <span className="text-text-secondary text-base">{feat}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — Chat mockup */}
        <div className="w-[420px] bg-bg-surface border border-border rounded-[var(--radius-lg)] overflow-hidden flex flex-col shrink-0">
          <div className="h-12 bg-bg-surface-2 flex items-center gap-2 px-4">
            <Sparkles size={16} className="text-accent" />
            <span className="text-text-primary text-sm font-semibold">
              AI Job Search
            </span>
          </div>
          <div className="flex flex-col gap-4 p-5 bg-bg-surface">
            <div className="flex justify-end">
              <div className="bg-accent text-white text-sm px-3.5 py-2.5 rounded-[12px_12px_2px_12px] max-w-[80%]">
                Find senior React jobs in NYC with 150k+ salary
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="bg-bg-surface-2 border border-border text-text-secondary text-sm px-3.5 py-2.5 rounded-[2px_12px_12px_12px] max-w-[300px]">
                I found 3 matching roles. The top match is a Senior Frontend
                Engineer at Vercel ($160k–$190k) in NYC requiring 5+ years of
                React...
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-bg-surface flex flex-col items-center gap-12 px-[120px] py-20">
        <h2 className="text-text-primary text-[40px] font-extrabold text-center">
          How it works
        </h2>
        <div className="flex gap-6 w-full">
          {HOW_IT_WORKS.map(({ n, title, desc }) => (
            <div
              key={n}
              className="flex-1 flex flex-col items-center gap-4 bg-bg-base border border-border rounded-[var(--radius-lg)] px-6 py-8"
            >
              <div className="w-10 h-10 rounded-full bg-accent-subtle flex items-center justify-center">
                <span className="text-accent text-base font-bold">{n}</span>
              </div>
              <span className="text-text-primary text-lg font-bold">
                {title}
              </span>
              <p className="text-text-secondary text-[15px] leading-[1.6] text-center">
                {desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="h-[100px] bg-bg-surface border-t border-border flex items-center justify-between px-20">
        <span className="text-text-primary font-bold text-lg">⚡ JobAI</span>
        <div className="flex items-center gap-8">
          <Link
            href="/jobs"
            className="text-text-muted text-sm hover:text-text-secondary"
          >
            Browse Jobs
          </Link>
          <Link
            href="/jobs"
            className="text-text-muted text-sm hover:text-text-secondary"
          >
            AI Search
          </Link>
          <Link
            href="/login"
            className="text-text-muted text-sm hover:text-text-secondary"
          >
            Login
          </Link>
        </div>
        <span className="text-text-muted text-sm">
          © 2026 JobAI. Powered by RAG.
        </span>
      </footer>
    </div>
  );
}
