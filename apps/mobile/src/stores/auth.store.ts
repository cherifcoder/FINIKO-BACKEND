import type { AuthSession, PublicUser, UserRole } from '@finiko/contracts';
import { create } from 'zustand';
import {
  deleteStoredItem,
  getStoredItem,
  setStoredItem,
  STORAGE_KEYS,
} from '../lib/secure-storage';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  refreshToken: string | null;
  user: PublicUser | null;
  hydrate: () => Promise<void>;
  setSession: (session: AuthSession) => void;
  setUser: (user: PublicUser) => void;
  clear: () => Promise<void>;
}

async function persist(session: AuthSession): Promise<void> {
  await Promise.all([
    setStoredItem(STORAGE_KEYS.accessToken, session.accessToken),
    setStoredItem(STORAGE_KEYS.refreshToken, session.refreshToken),
    setStoredItem(STORAGE_KEYS.user, JSON.stringify(session.user)),
  ]);
}

async function erase(): Promise<void> {
  await Promise.all([
    deleteStoredItem(STORAGE_KEYS.accessToken),
    deleteStoredItem(STORAGE_KEYS.refreshToken),
    deleteStoredItem(STORAGE_KEYS.user),
  ]);
}

function parseStoredUser(raw: string | null): PublicUser | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PublicUser>;
    return parsed.id && parsed.role ? (parsed as PublicUser) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  accessToken: null,
  refreshToken: null,
  user: null,

  hydrate: async () => {
    const [accessToken, refreshToken, rawUser] = await Promise.all([
      getStoredItem(STORAGE_KEYS.accessToken),
      getStoredItem(STORAGE_KEYS.refreshToken),
      getStoredItem(STORAGE_KEYS.user),
    ]);

    const user = parseStoredUser(rawUser);

    if (accessToken && refreshToken && user) {
      set({ status: 'authenticated', accessToken, refreshToken, user });
    } else {
      set({ status: 'anonymous', accessToken: null, refreshToken: null, user: null });
    }
  },

  setSession: (session) => {
    set({
      status: 'authenticated',
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user,
    });
    void persist(session);
  },

  setUser: (user) => {
    const current = get();

    if (!current.accessToken || !current.refreshToken) return;

    set({ user });
    void persist({
      accessToken: current.accessToken,
      refreshToken: current.refreshToken,
      expiresIn: 0,
      user,
    });
  },

  clear: async () => {
    set({ status: 'anonymous', accessToken: null, refreshToken: null, user: null });
    await erase();
  },
}));

export function roleLabel(role: UserRole): string {
  switch (role) {
    case 'client':
      return 'Espace client';
    case 'livreur':
      return 'Espace livreur';
    case 'pressing':
      return 'Espace pressing';
    case 'admin':
      return 'Administration';
  }
}
