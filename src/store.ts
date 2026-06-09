import { create } from 'zustand';
import type { User, Chat, Message } from './types.ts';

interface AppState {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  // Local cache
  usersCache: Record<string, User>;
  addUserToCache: (user: User) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentUser: (() => {
    try {
      const stored = localStorage.getItem('chat_current_user');
      if (stored) return JSON.parse(stored);
    } catch(e) {}
    return null;
  })(),
  setCurrentUser: (user) => {
    if (user) localStorage.setItem('chat_current_user', JSON.stringify(user));
    else localStorage.removeItem('chat_current_user');
    set({ currentUser: user });
  },
  usersCache: {},
  addUserToCache: (user) => set((state) => ({ usersCache: { ...state.usersCache, [user.id]: user } })),
}));
