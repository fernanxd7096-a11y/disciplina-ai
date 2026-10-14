import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { Text } from './Text';

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: ComponentProps<typeof Ionicons>['name'];
  accessibilityLabel?: string;
  compact?: boolean;
  testID?: string;
};

/** Opción seleccionable (filtros, días de la semana, categorías). */
export function Chip({ label, selected, onPress, icon, accessibilityLabel, compact, testID }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      hitSlop={4}
      style={({ pressed }) => [
        styles.chip,
        compact && styles.compact,
        selected && styles.selected,
        pressed && { opacity: 0.8 },
      ]}>
      {icon ? <Ionicons name={icon} size={16} color={selected ? colors.accent : colors.textSecondary} /> : null}
      <Text variant="caption" color={selected ? 'text' : 'textSecondary'} style={selected && styles.bold}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  compact: { minWidth: 40, justifyContent: 'center', paddingHorizontal: spacing.sm },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  bold: { fontWeight: '600' },
});
