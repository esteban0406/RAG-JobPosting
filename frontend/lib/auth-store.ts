import { create } from "zustand";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  skills: string[];
  preferredFields: string[];
  location: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AuthState {
  user: UserProfile | null;
  isLoggedIn: boolean;
  setUser: (user: UserProfile) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoggedIn: false,
  setUser: (user) => set({ user, isLoggedIn: true }),
  clear: () => set({ user: null, isLoggedIn: false }),
}));
