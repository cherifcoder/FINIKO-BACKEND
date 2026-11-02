import { Platform } from 'react-native';
import type { ApiResponse } from '@finiko/contracts';

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

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  const payload = (await response.json()) as ApiResponse<T>;

  if (!payload.success) {
    throw new ApiClientError(
      response.status,
      payload.error.code,
      payload.error.message,
      payload.error.details,
    );
  }

  return payload.data;
}
