import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { useIsOnline } from '@/lib/network';
import { colors, spacing } from '@/theme';

/** Franja visible mientras no hay conexión, para que nunca parezca que algo se guardó cuando no. */
export function OfflineBanner() {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <View
      style={[styles.bar, { paddingTop: insets.top + spacing.xs }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="offline-banner">
      <Ionicons name="cloud-offline-outline" size={16} color={colors.warning} />
      <Text variant="caption" color="warning" style={styles.text}>
        Sin conexión · ves tus datos guardados. Marcar hábitos y completar tareas se enviará al reconectar.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
    backgroundColor: colors.warningSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.warning,
  },
  text: { flex: 1 },
});
