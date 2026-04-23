import { create } from "zustand";

interface AiStore {
  isOpen: boolean;
  contextJobIds: Set<string>;
  open: () => void;
  close: () => void;
  toggle: () => void;
  toggleContextJob: (id: string) => void;
  clearContext: () => void;
}

export const useAiStore = create<AiStore>((set) => ({
  isOpen: false,
  contextJobIds: new Set(),
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
}));
