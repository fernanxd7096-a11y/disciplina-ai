import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import { AppProviders } from '@/providers/AppProviders';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AppProviders>
      <StatusBar style="light" />
      <RootStack />
    </AppProviders>
  );
}

function RootStack() {
  const { status } = useAuth();

  useEffect(() => {
    // La pantalla de carga se mantiene hasta saber si hay sesión guardada.
    if (status !== 'loading') SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') return null;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Protected guard={status === 'signedIn'}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="assistant" options={{ title: 'Asistente', presentation: 'modal' }} />
        <Stack.Screen name="stats" options={{ title: 'Estadísticas' }} />
        <Stack.Screen name="settings" options={{ title: 'Ajustes' }} />
        <Stack.Screen name="habit/new" options={{ title: 'Nuevo hábito', presentation: 'modal' }} />
        <Stack.Screen name="habit/[id]" options={{ title: 'Hábito' }} />
        <Stack.Screen name="habit/edit/[id]" options={{ title: 'Editar hábito', presentation: 'modal' }} />
      </Stack.Protected>

      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={status === 'unconfigured'}>
        <Stack.Screen name="setup" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
