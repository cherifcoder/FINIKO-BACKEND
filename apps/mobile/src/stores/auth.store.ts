import type { UserRole } from '@finiko/contracts';
import { create } from 'zustand';

interface AuthState {
  accessToken: string | null;
  role: UserRole | null;
  setSession: (session: { accessToken: string; role: UserRole }) => void;
  clear: () => void;
}

/**
 * Socle du store d authentification.
 * La persistance securisee (SecureStore) et le refresh seront branches au lot 1.
 */
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  role: null,
  setSession: ({ accessToken, role }) => set({ accessToken, role }),
  clear: () => set({ accessToken: null, role: null }),
}));
