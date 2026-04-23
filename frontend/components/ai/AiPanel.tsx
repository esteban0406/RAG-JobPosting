"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { Sparkles, Send, X, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchApi, streamSearch, ApiError } from "@/lib/api";
import { useAiStore } from "@/lib/ai-store";
import { ContextPickerButton } from "./ContextPickerButton";
import { JobDetailModal } from "@/components/jobs/JobDetailModal";
import type { Job } from "@/components/jobs/JobCard";

interface JobSource {
  jobId: string;
  title: string;
  company: string;
  url: string;
  similarity: number;
}

interface SearchResponse {
  type: "retrieval" | "aggregation" | "hybrid";
  answer: string;
  sources?: JobSource[];
  aggregation?: {
    intent: string;
    rows: Record<string, unknown>[];
  };
  retrievedAt: string;
}

interface Message {
  role: "user" | "ai";
  text: string;
  sources?: JobSource[];
  aggregation?: SearchResponse["aggregation"];
  error?: boolean;
  streaming?: boolean;
}

interface AiPanelProps {
  isLoggedIn?: boolean;
  onClose: () => void;
}

function getHints(isLoggedIn: boolean, hasContext: boolean) {
  if (!isLoggedIn) {
    return {
      items: [
        "Find remote React jobs with 150k+ salary",
        "What are the top companies hiring data scientists?",
        "Compare frontend vs backend salaries",
      ],
      tip: "Log in and upload your resume for personalised results",
    };
  }
  if (hasContext) {
    return {
      items: [
        "How do I compare to the requirements for these jobs?",
        "Which of these jobs fits my experience best?",
        "What salary should I expect for these roles?",
      ],
      tip: null,
    };
  }
  return {
    items: [
      "Recommend jobs that match my skills and experience",
      "Am I a good fit for a senior React engineer role?",
      "What skills should I develop to get a data science job?",
    ],
    tip: "Tap the briefcase icon to add saved jobs and ask specific questions about them.",
  };
}

export function AiPanel({ isLoggedIn, onClose }: AiPanelProps) {
  const { contextJobIds } = useAiStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend() {
    const query = input.trim();
    if (!query || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: query }]);
    setLoading(true);

    let streamingStarted = false;

    try {
      const ids = Array.from(contextJobIds);
      const body = { query, ...(ids.length > 0 ? { contextJobIds: ids } : {}) };

      for await (const event of streamSearch(body)) {
        if (event.type === "start") {
          setMessages((prev) => [...prev, { role: "ai", text: "", streaming: true }]);
          streamingStarted = true;
        } else if (event.type === "token") {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === "ai") {
              copy[copy.length - 1] = { ...last, text: last.text + (event.content ?? "") };
            }
            return copy;
          });
        } else if (event.type === "done") {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === "ai") {
              copy[copy.length - 1] = {
                ...last,
                sources: event.sources,
                aggregation: event.aggregation ?? undefined,
                streaming: false,
              };
            }
            return copy;
          });
        } else if (event.type === "error") {
          const isRateLimit = event.status === 429;
          const text = isRateLimit
            ? "Rate limit reached — please wait a moment and try again."
            : event.message ?? "Something went wrong. Please try again.";
          if (streamingStarted) {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "ai") {
                copy[copy.length - 1] = { ...last, text, error: true, streaming: false };
              }
              return copy;
            });
          } else {
            setMessages((prev) => [...prev, { role: "ai", text, error: true }]);
          }
        }
      }
    } catch (err) {
      const isRateLimit = err instanceof ApiError && err.status === 429;
      const text = isRateLimit
        ? "Rate limit reached — please wait a moment and try again."
        : "Something went wrong. Please try again.";
      if (streamingStarted) {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === "ai") {
            copy[copy.length - 1] = { ...last, text, error: true, streaming: false };
          }
          return copy;
        });
      } else {
        setMessages((prev) => [...prev, { role: "ai", text, error: true }]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSourceClick(src: JobSource) {
    try {
      const full = await fetchApi<Job>(`/jobs/${src.jobId}`);
      setSelectedJob(full);
      setDetailOpen(true);
    } catch {
      setSelectedJob({
        id: src.jobId,
        title: src.title,
        company: src.company,
        url: src.url,
        description: "",
        location: null,
        jobType: null,
        minSalary: null,
        maxSalary: null,
        source: "",
        summary: null,
        responsibilities: [],
        requirements: [],
        benefits: [],
        skills: [],
        logo: null,
      });
      setDetailOpen(true);
    }
  }

  const hasContext = contextJobIds.size > 0;
  const hints = getHints(!!isLoggedIn, hasContext);

  return (
    <div className="h-full flex flex-col bg-bg-surface">
      {/* Header */}
      <div className="flex flex-row items-center justify-between px-5 h-14 bg-bg-surface-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-accent" />
          <span className="text-text-primary text-base font-semibold">Ask AI</span>
          {isLoggedIn && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-accent-subtle text-accent-glow border border-accent/20">
              Resume &amp; profile context active
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center bg-bg-surface rounded-[var(--radius-sm)] text-text-muted hover:text-text-primary transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-4 p-5">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <Sparkles size={32} className="text-accent opacity-50" />
            <p className="text-text-secondary text-sm">
              Ask me anything about jobs — I&apos;ll search and synthesize an answer for you.
            </p>
            <div className="flex flex-col gap-2 mt-2 w-full max-w-sm">
              {hints.items.map((hint) => (
                <button
                  key={hint}
                  onClick={() => setInput(hint)}
                  className="text-left px-3 py-2 bg-bg-surface-2 border border-border rounded-[var(--radius-md)] text-text-secondary text-sm hover:border-accent/50 hover:text-text-primary transition-colors"
                >
                  {hint}
                </button>
              ))}
              {hints.tip && (
                <p className="text-text-muted text-xs mt-1">{hints.tip}</p>
              )}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start flex-col gap-3"}`}
          >
            {msg.role === "user" ? (
              <div className="bg-accent text-white text-sm px-3.5 py-2.5 rounded-[12px_12px_2px_12px] max-w-[80%]">
                {msg.text}
              </div>
            ) : (
              <>
                {msg.error ? (
                  <div className="flex items-start gap-2 bg-bg-surface-2 border border-border text-text-secondary text-sm px-3.5 py-2.5 rounded-[2px_12px_12px_12px] max-w-[90%]">
                    <AlertCircle size={14} className="text-danger shrink-0 mt-0.5" />
                    {msg.text}
                  </div>
                ) : (
                  <div className="bg-bg-surface-2 border border-border text-text-secondary text-sm px-3.5 py-2.5 rounded-[2px_12px_12px_12px] leading-relaxed prose prose-sm prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                  </div>
                )}

                {msg.sources && msg.sources.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-text-muted text-xs font-medium">
                      Sources ({msg.sources.length})
                    </span>
                    {msg.sources.map((src) => (
                      <button
                        key={src.jobId}
                        onClick={() => handleSourceClick(src)}
                        className="text-left flex flex-col gap-0.5 bg-bg-base border border-border rounded-[var(--radius-md)] px-3 py-2.5 hover:border-accent/50 transition-colors group"
                      >
                        <span className="text-text-primary text-sm font-medium group-hover:text-accent-glow transition-colors">
                          {src.title}
                        </span>
                        <span className="text-text-muted text-xs">
                          {src.company} · {Math.round(src.similarity * 100)}% match
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {msg.aggregation && msg.aggregation.rows.length > 0 && (
                  <div className="border border-border rounded-[var(--radius-md)] overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody>
                        {msg.aggregation.rows.slice(0, 5).map((row, ri) => (
                          <tr key={ri} className="border-b border-border last:border-0">
                            {Object.entries(row).map(([k, v]) => (
                              <td key={k} className="px-3 py-2 text-text-secondary text-xs">
                                {String(v)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {loading && !messages.some((m) => m.role === "ai" && m.streaming) && (
          <div className="flex justify-start">
            <div className="bg-bg-surface-2 border border-border px-3.5 py-2.5 rounded-[2px_12px_12px_12px]">
              <div className="flex items-center gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-border p-4">
        <div className="flex items-center gap-2 bg-bg-base border border-border-subtle rounded-[var(--radius-md)] px-3 focus-within:border-accent transition-colors">
          <Suspense fallback={<div className="w-8 h-8 shrink-0" />}>
            <ContextPickerButton isLoggedIn={isLoggedIn} />
          </Suspense>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Ask about jobs, salaries, companies…"
            disabled={loading}
            className="flex-1 bg-transparent text-text-primary text-sm py-3 outline-none placeholder:text-text-muted disabled:opacity-60"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="w-8 h-8 flex items-center justify-center bg-accent rounded-[var(--radius-sm)] text-white hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
          >
            <Send size={14} />
          </button>
        </div>
      </div>

      {/* Job detail modal triggered from source cards */}
      <JobDetailModal
        job={selectedJob}
        open={detailOpen}
        isSaved={false}
        onClose={() => {
          setDetailOpen(false);
          setTimeout(() => setSelectedJob(null), 300);
        }}
        onSaveToggle={() => {}}
      />
    </div>
  );
}
