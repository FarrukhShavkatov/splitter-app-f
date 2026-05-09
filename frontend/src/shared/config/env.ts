import { Platform } from 'react-native';

const DEFAULT_API_URL = 'http://localhost:8080';

function normalizeApiUrl(rawUrl?: string): string {
  const value = (rawUrl || '').trim();

  if (!value) {
    if (__DEV__) {
      console.warn(
        `[ENV] EXPO_PUBLIC_API_URL is not set. Falling back to ${DEFAULT_API_URL}. ` +
          'This works for web/local emulator, but Expo Go on a real phone needs your computer LAN IP.'
      );
    }
    return DEFAULT_API_URL;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Invalid protocol');
    }

    if (
      __DEV__ &&
      Platform.OS !== 'web' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    ) {
      console.warn(
        '[ENV] EXPO_PUBLIC_API_URL points to localhost. On a real phone this means the phone itself, not your computer. ' +
          'Use your computer LAN IP, for example http://192.168.1.23:8080.'
      );
    }

    return value.replace(/\/+$/, '');
  } catch {
    console.warn(
      `[ENV] Invalid EXPO_PUBLIC_API_URL="${value}". Falling back to ${DEFAULT_API_URL}.`
    );
    return DEFAULT_API_URL;
  }
}

export const API_URL = normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL);
