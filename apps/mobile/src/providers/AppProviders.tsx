import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import Constants from 'expo-constants';
import { ThemeProvider } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '@/features/auth/AuthProvider';
import { wireOnlineManager } from '@/lib/network';
import { createQueryPersister } from '@/lib/queryPersister';
import { navigationTheme } from '@/theme';

const WEEK = 7 * 86_400_000;

wireOnlineManager();

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // gcTime ≥ maxAge del persistidor: si no, la caché guardada se descarta al restaurar.
      queries: { retry: 2, staleTime: 30_000, gcTime: WEEK },
      mutations: { retry: 0 },
    },
  });
}

/** Todos los proveedores globales en un solo lugar. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  const [persister] = useState(createQueryPersister);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: WEEK,
            // Cambiar de versión de la app invalida la caché vieja (por si cambió el formato).
            buster: Constants.expoConfig?.version ?? 'dev',
            dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' },
          }}>
          <AuthProvider>
            <ThemeProvider value={navigationTheme}>{children}</ThemeProvider>
          </AuthProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
