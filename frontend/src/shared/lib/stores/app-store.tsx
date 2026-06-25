import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentUser } from '@/features/auth/api';
import { getToken, removeToken } from '../utils/token-storage';
import type { LanguageCode } from '@/shared/config/languages';
import { DEFAULT_LANGUAGE } from '@/shared/config/languages';
import {
  DEFAULT_CURRENCY,
  normalizeSelectableCurrency,
  type SelectableCurrencyCode,
} from '@/shared/lib/currency';

export interface User {
  id: number;
  email: string;
  username: string;
  uniqueId: string;
  avatarUrl: string | null;
}

// dark-mode
interface AppStore {
  // Auth state
  token: string | null;
  user: User | null;
  isLoading: boolean;
  
  // App settings
  theme: 'light' | 'dark' | 'system';
  language: LanguageCode;
  currency: SelectableCurrencyCode;
  
  // Actions
  setToken: (token: string) => void;
  setUser: (user: User) => void;
  setAuth: (token: string, user: User) => void;
  logout: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setLanguage: (language: LanguageCode) => void;
  setCurrency: (currency: SelectableCurrencyCode) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Initial state
      token: null,
      user: null,
      isLoading: false,
      theme: 'light',
      language: DEFAULT_LANGUAGE,
      currency: DEFAULT_CURRENCY,

      // Auth actions
      setToken: (token: string) => {
        set({ token });
      },

      setUser: (user: User) => {
        set({ user });
      },

      setAuth: (token: string, user: User) => {
        set({ token, user });
      },

      logout: async () => {
        try {
          await removeToken();
          set({ token: null, user: null });
        } catch (error) {
          console.error('Logout error:', error);
        }
      },

      initializeAuth: async () => {
        set({ isLoading: true });
        try {
          const token = await getToken();
          if (!token) {
            set({ token: null, user: null });
            return;
          }

          set({ token });

          try {
            const currentUser = await getCurrentUser(token);
            set({ user: currentUser });
          } catch (error) {
            console.error('Current user fetch error:', error);
            set({ user: null });

            if (error instanceof Error && /authorization/i.test(error.message)) {
              await removeToken();
              set({ token: null, user: null });
            }
          }
        } catch (error) {
          console.error('Auth initialization error:', error);
          set({ token: null, user: null });
        } finally {
          set({ isLoading: false });
        }
      },

      // App settings actions
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setCurrency: (currency) => set({ currency: normalizeSelectableCurrency(currency) }),
    }),
    {
      name: 'app-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        theme: state.theme,
        language: state.language,
        currency: normalizeSelectableCurrency(state.currency),
        // Не сохраняем токен и пользователя в AsyncStorage, 
        // так как токен сохраняется отдельно в SecureStore
      }),
    }
  )
);

// Provider component for initialization
import { ReactNode, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { onUnauthorized } from '@/shared/api/auth-events';

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const initializeAuth = useAppStore((s) => s.initializeAuth);
  const logout = useAppStore((s) => s.logout);
  const router = useRouter();
  
  useEffect(() => {
    initializeAuth();
  }, []);

  useEffect(() => {
    const unsubscribe = onUnauthorized(async () => {
      await logout();
      router.replace('/');
    });
    return unsubscribe;
  }, [logout, router]);
  
  return <>{children}</>;
}
