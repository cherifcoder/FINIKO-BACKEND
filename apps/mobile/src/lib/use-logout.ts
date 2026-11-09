import { router } from 'expo-router';
import { useState } from 'react';
import { logoutRequest } from '../api/auth';
import { useAuthStore } from '../stores/auth.store';

/** Déconnexion partagée par tous les tableaux de bord. */
export function useLogout() {
  const clear = useAuthStore((state) => state.clear);
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    setLoggingOut(true);
    const refreshToken = useAuthStore.getState().refreshToken;

    try {
      if (refreshToken) {
        await logoutRequest(refreshToken);
      }
    } catch {
      // La session locale est effacée même si le serveur est injoignable.
    } finally {
      await clear();
      setLoggingOut(false);
      router.replace('/(auth)/login');
    }
  };

  return { logout, loggingOut };
}
