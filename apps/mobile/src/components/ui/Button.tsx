import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, minTouchSize, radius, spacing, type ColorToken } from '@/theme';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: ComponentProps<typeof Ionicons>['name'];
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Ocupa el espacio disponible en una fila (botones lado a lado). */
  grow?: boolean;
  testID?: string;
};

const variantStyles: Record<Variant, { bg: string; border: string; text: ColorToken }> = {
  primary: { bg: colors.accent, border: colors.accent, text: 'textOnAccent' },
  secondary: { bg: colors.surfaceRaised, border: colors.borderStrong, text: 'text' },
  ghost: { bg: 'transparent', border: 'transparent', text: 'accent' },
  danger: { bg: colors.dangerSoft, border: colors.danger, text: 'danger' },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  grow = false,
  testID,
}: ButtonProps) {
  const v = variantStyles[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: v.bg, borderColor: v.border },
        fullWidth && styles.full,
        grow && styles.grow,
        pressed && styles.pressed,
        inactive && styles.inactive,
      ]}>
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={colors[v.text]} />
        ) : (
          icon && <Ionicons name={icon} size={18} color={colors[v.text]} />
        )}
        <Text variant="bodyStrong" color={v.text}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTouchSize,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  full: { alignSelf: 'stretch' },
  grow: { flexGrow: 1, flexBasis: 0 },
  pressed: { opacity: 0.85 },
  inactive: { opacity: 0.5 },
});
