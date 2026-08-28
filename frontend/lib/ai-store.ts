import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface JobSource {
  jobId: string;
  title: string;
  company: string;
  url: string;
  similarity: number;
}

export interface Message {
  role: "user" | "ai";
  text: string;
  sources?: JobSource[];
  error?: boolean;
  streaming?: boolean;
}

interface AiStore {
  isOpen: boolean;
  contextJobIds: Set<string>;
  messages: Message[];
  lastSources: JobSource[];
  open: () => void;
  close: () => void;
  toggle: () => void;
  toggleContextJob: (id: string) => void;
  clearContext: () => void;
  addContextJobIds: (ids: string[]) => void;
  setMessages: (
    updater: Message[] | ((prev: Message[]) => Message[]),
  ) => void;
  setLastSources: (sources: JobSource[]) => void;
  newChat: () => void;
}

interface PersistedAiState {
  messages: Message[];
  lastSources: JobSource[];
  contextJobIds: string[];
}

export const useAiStore = create<AiStore>()(
  persist(
    (set) => ({
      isOpen: false,
      contextJobIds: new Set(),
      messages: [],
      lastSources: [],
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      toggleContextJob: (id) =>
        set((s) => {
          const next = new Set(s.contextJobIds);
          next.has(id) ? next.delete(id) : next.add(id);
          return { contextJobIds: next };
        }),
      clearContext: () => set({ contextJobIds: new Set() }),
      addContextJobIds: (ids) =>
        set((s) => ({
          contextJobIds: new Set([...s.contextJobIds, ...ids]),
        })),
      setMessages: (updater) =>
        set((s) => ({
          messages:
            typeof updater === "function"
              ? (updater as (prev: Message[]) => Message[])(s.messages)
              : updater,
        })),
      setLastSources: (sources) => set({ lastSources: sources }),
      newChat: () =>
        set({ messages: [], lastSources: [], contextJobIds: new Set() }),
    }),
    {
      name: "ai-chat-storage",
      partialize: (state): PersistedAiState => ({
        messages: state.messages,
        lastSources: state.lastSources,
        contextJobIds: Array.from(state.contextJobIds),
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<PersistedAiState> | undefined;
        return {
          ...current,
          messages: p?.messages ?? current.messages,
          lastSources: p?.lastSources ?? current.lastSources,
          contextJobIds: new Set(p?.contextJobIds ?? []),
        };
      },
    },
  ),
);
