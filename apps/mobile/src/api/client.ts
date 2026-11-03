import { Platform } from 'react-native';
import type { ApiResponse, AuthSession } from '@finiko/contracts';
import { useAuthStore } from '../stores/auth.store';

const defaultApiUrl =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000/api/v1' : 'http://localhost:3000/api/v1';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? defaultApiUrl;

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

interface ApiFetchOptions extends RequestInit {
  /** Attache le Bearer token et tente un refresh sur 401. Défaut : true. */
  auth?: boolean;
  /** Interdit la tentative de refresh (endpoints publics ou refresh lui-même). */
  skipRefresh?: boolean;
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const refreshToken = useAuthStore.getState().refreshToken;

  if (!refreshToken) return false;

  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      const payload = (await response.json()) as ApiResponse<AuthSession>;

      if (!response.ok || !payload.success) {
        if (response.status === 401) {
          await useAuthStore.getState().clear();
        }
        return false;
      }

      useAuthStore.getState().setSession(payload.data);
      return true;
    } catch {
      // Réseau indisponible : on conserve la session pour réessayer plus tard.
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function toError(response: Response, payload: unknown): Promise<ApiClientError> {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'success' in payload &&
    payload.success === false &&
    'error' in payload
  ) {
    const error = (payload as { error: { code: string; message: string; details?: unknown } })
      .error;
    return new ApiClientError(response.status, error.code, error.message, error.details);
  }

  return new ApiClientError(
    response.status,
    'NETWORK_ERROR',
    'Réponse inattendue du serveur. Réessayez.',
  );
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { auth = true, skipRefresh = false, ...init } = options;

  const buildRequest = (): RequestInit => {
    const token = useAuthStore.getState().accessToken;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers as Record<string, string> | undefined),
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    };

    return { ...init, headers };
  };

  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, buildRequest());
  } catch {
    throw new ApiClientError(0, 'NETWORK_ERROR', 'Serveur injoignable. Vérifiez votre connexion.');
  }

  if (response.status === 401 && auth && !skipRefresh) {
    const refreshed = await refreshSession();

    if (refreshed) {
      try {
        response = await fetch(`${API_URL}${path}`, buildRequest());
      } catch {
        throw new ApiClientError(0, 'NETWORK_ERROR', 'Serveur injoignable.');
      }
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw await toError(response, payload);
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('success' in payload) ||
    payload.success !== true ||
    !('data' in payload)
  ) {
    throw new ApiClientError(response.status, 'INVALID_RESPONSE', 'Réponse inattendue du serveur.');
  }

  return (payload as unknown as { data: T }).data;
}
