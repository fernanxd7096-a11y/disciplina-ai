import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing, type ColorToken } from '@/theme';
import { Text } from './Text';

type Tone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

const tones: Record<Tone, { bg: string; text: ColorToken }> = {
  accent: { bg: colors.accentSoft, text: 'accent' },
  success: { bg: colors.successSoft, text: 'success' },
  warning: { bg: colors.warningSoft, text: 'warning' },
  danger: { bg: colors.dangerSoft, text: 'danger' },
  neutral: { bg: colors.surfaceRaised, text: 'textSecondary' },
};

/**
 * Etiqueta corta. Se usa también para marcar el origen de un dato
 * ("Registrado", "Estimación IA") como exige la especificación.
 */
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const t = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text variant="caption" color={t.text}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
});
