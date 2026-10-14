import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { Text } from './Text';

type Tone = 'error' | 'success' | 'info';

const tones = {
  error: { bg: colors.dangerSoft, border: colors.danger, icon: 'alert-circle-outline', text: 'danger' },
  success: { bg: colors.successSoft, border: colors.success, icon: 'checkmark-circle-outline', text: 'success' },
  info: { bg: colors.accentSoft, border: colors.accent, icon: 'information-circle-outline', text: 'text' },
} as const;

/** Mensaje en línea (error del servidor, confirmación) anunciado a lectores de pantalla. */
export function Notice({ tone, message, testID }: { tone: Tone; message: string; testID?: string }) {
  const t = tones[tone];
  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[styles.box, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Ionicons name={t.icon} size={18} color={t.border} />
      <Text variant="caption" color={t.text} style={styles.text}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  text: { flex: 1 },
});
