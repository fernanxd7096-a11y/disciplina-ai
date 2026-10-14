import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Altura de la barra sin contar el área segura inferior (gestos / botones de Android). */
const TAB_BAR_BASE_HEIGHT = 60;

function icon(active: IconName, inactive: IconName) {
  function TabIcon({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <Ionicons name={focused ? active : inactive} color={color} size={size} />;
  }
  return TabIcon;
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: TAB_BAR_BASE_HEIGHT + insets.bottom,
          paddingTop: spacing.xs,
          paddingBottom: insets.bottom + spacing.xs,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: icon('home', 'home-outline') }} />
      <Tabs.Screen name="habits" options={{ title: 'Hábitos', tabBarIcon: icon('flame', 'flame-outline') }} />
      <Tabs.Screen
        name="planner"
        options={{ title: 'Agenda', tabBarIcon: icon('calendar', 'calendar-outline') }}
      />
      <Tabs.Screen
        name="training"
        options={{ title: 'Entreno', tabBarIcon: icon('barbell', 'barbell-outline') }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{ title: 'Nutrición', tabBarIcon: icon('nutrition', 'nutrition-outline') }}
      />
    </Tabs>
  );
}
