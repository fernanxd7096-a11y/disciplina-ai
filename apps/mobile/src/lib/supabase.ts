import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import { publicEnv } from './env';
import { createSecureSessionStorage } from './secureSessionStorage';

const secureStore = {
  getItem: (k: string) => SecureStore.getItemAsync(k),
  setItem: (k: string, v: string) => SecureStore.setItemAsync(k, v),
  removeItem: (k: string) => SecureStore.deleteItemAsync(k),
};

/**
 * Cliente de Supabase, o null si faltan EXPO_PUBLIC_SUPABASE_URL /
 * EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (la app muestra una pantalla de configuración).
 */
export const supabase: SupabaseClient | null = publicEnv
  ? createClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
      auth: {
        ...(Platform.OS !== 'web'
          ? {
              storage: createSecureSessionStorage({
                bulk: AsyncStorage,
                secure: secureStore,
                randomBytes: (n) => Crypto.getRandomBytes(n),
              }),
            }
          : {}),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// Renovar el token solo mientras la app está en primer plano (recomendación de Supabase).
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
