import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { ApiResponse, AuthSession } from '@finiko/contracts';
import { useAuthStore } from '../stores/auth.store';

/**
 * URL publique de l'API en production (déployée sur Vercel).
 * À mettre à jour si le nom du projet Vercel change, ou à surcharger via
 * `EXPO_PUBLIC_API_URL` lors du build (EAS / .env).
 */
const PRODUCTION_API_URL = 'https://finiko-backend-two.vercel.app/api/v1';

/** Timeout par requête (ms). Tolère le cold start des fonctions Vercel. */
const REQUEST_TIMEOUT_MS = 20_000;

/** Délai avant la seconde tentative (cold start Vercel). */
const COLD_START_RETRY_DELAY_MS = 500;

/**
 * Résolution de l'URL de base de l'API :
 * 1. `EXPO_PUBLIC_API_URL` s'il est défini (priorité absolue) ;
 * 2. en production (`__DEV__ === false`) : l'URL publique Vercel,
 *    JAMAIS localhost / 127.0.0.1 / IP LAN ;
 * 3. en développement local : l'hôte du serveur Expo (IP LAN du PC),
 *    sinon `10.0.2.2` (émulateur Android) ou `localhost` (iOS/web).
 */
function resolveApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();

  if (configured) return configured;

  if (!__DEV__) return PRODUCTION_API_URL;

  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.replace(/:\d+$/, '');

  if (host) return `http://${host}:3000/api/v1`;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `http://${window.location.hostname}:3000/api/v1`;
  }

  return Platform.OS === 'android' ? 'http://10.0.2.2:3000/api/v1' : 'http://localhost:3000/api/v1';
}

export const API_URL = resolveApiUrl();

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

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';

/** `fetch` avec timeout : évite les requêtes bloquées à l'infini. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function requestOnce(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchWithTimeout(url, init);
  } catch (error) {
    if (isAbortError(error)) {
      throw new ApiClientError(
        0,
        'NETWORK_TIMEOUT',
        'Le serveur met trop de temps à répondre (cold start possible). Réessayez.',
      );
    }
    throw new ApiClientError(0, 'NETWORK_ERROR', 'Serveur injoignable. Vérifiez votre connexion.');
  }
}

/**
 * Une fonction serverless Vercel peut être "froide" (mise en veille) :
 * la toute première requête peut échouer ou expirer. On retente donc
 * une fois les requêtes idempotentes (GET/HEAD/OPTIONS) après un court
 * délai, le temps que l'instance démarre.
 */
async function requestWithColdStartRetry(url: string, init: RequestInit): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const idempotent = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

  try {
    return await requestOnce(url, init);
  } catch (error) {
    if (!idempotent || !(error instanceof ApiClientError) || error.status !== 0) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, COLD_START_RETRY_DELAY_MS));
    return requestOnce(url, init);
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const refreshToken = useAuthStore.getState().refreshToken;

  if (!refreshToken) return false;

  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const response = await requestWithColdStartRetry(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        skipRefresh: true,
      } as RequestInit);

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

  response = await requestWithColdStartRetry(`${API_URL}${path}`, buildRequest());

  if (response.status === 401 && auth && !skipRefresh) {
    const refreshed = await refreshSession();

    if (refreshed) {
      response = await requestWithColdStartRetry(`${API_URL}${path}`, buildRequest());
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
