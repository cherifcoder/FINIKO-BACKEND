import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';

function webStorage(): Storage | null {
  if (typeof globalThis.localStorage === 'undefined') return null;
  return globalThis.localStorage;
}

/**
 * SecureStore sur iOS/Android, localStorage sur le web (export de démonstration).
 * Les jetons restent hors de l'état React persistant.
 */
export async function getStoredItem(key: string): Promise<string | null> {
  if (isWeb) {
    return webStorage()?.getItem(key) ?? null;
  }

  return SecureStore.getItemAsync(key);
}

export async function setStoredItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    webStorage()?.setItem(key, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

export async function deleteStoredItem(key: string): Promise<void> {
  if (isWeb) {
    webStorage()?.removeItem(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}

export const STORAGE_KEYS = {
  accessToken: 'finiko.accessToken',
  refreshToken: 'finiko.refreshToken',
  user: 'finiko.user',
} as const;
