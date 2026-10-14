import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { navigationTheme } from '@/theme';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 2, staleTime: 30_000 },
      mutations: { retry: 0 },
    },
  });
}

/** Todos los proveedores globales en un solo lugar (Auth y SQLite se añaden en la Fase 3). */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={navigationTheme}>{children}</ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
