import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { OfflineBanner } from '@/components/OfflineBanner';
import { useAuth } from '@/features/auth/AuthProvider';
import { useNotificationSync } from '@/features/reminders/useNotificationSync';
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

/** Efectos que solo existen con sesión, en cualquier pantalla (también si se abre por un enlace). */
function SignedInEffects() {
  useNotificationSync();
  return null;
}

function RootStack() {
  const { status } = useAuth();

  useEffect(() => {
    // La pantalla de carga se mantiene hasta saber si hay sesión guardada.
    if (status !== 'loading') SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') return null;

  return (
    <>
      {status === 'signedIn' ? <SignedInEffects /> : null}
      {status === 'signedIn' ? <OfflineBanner /> : null}
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
          <Stack.Screen name="task/new" options={{ title: 'Nueva tarea', presentation: 'modal' }} />
          <Stack.Screen name="task/[id]" options={{ title: 'Tarea' }} />
          <Stack.Screen name="note/new" options={{ title: 'Nueva nota' }} />
          <Stack.Screen name="note/[id]" options={{ title: 'Nota' }} />
          <Stack.Screen name="event/new" options={{ title: 'Nuevo evento', presentation: 'modal' }} />
          <Stack.Screen name="event/[id]" options={{ title: 'Evento' }} />
          <Stack.Screen name="training/profile" options={{ title: 'Perfil de entrenamiento', presentation: 'modal' }} />
          <Stack.Screen name="training/plan-new" options={{ title: 'Nueva rutina' }} />
          <Stack.Screen name="training/session/[id]" options={{ title: 'Entrenamiento' }} />
          <Stack.Screen name="training/exercise/[id]" options={{ title: 'Ejercicio' }} />
        </Stack.Protected>

        <Stack.Protected guard={status === 'signedOut'}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>

        <Stack.Protected guard={status === 'unconfigured'}>
          <Stack.Screen name="setup" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
