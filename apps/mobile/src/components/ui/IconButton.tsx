import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { colors, minTouchSize, radius } from '@/theme';

type IconButtonProps = {
  icon: ComponentProps<typeof Ionicons>['name'];
  /** Obligatorio: un botón solo con icono necesita nombre accesible. */
  accessibilityLabel: string;
  onPress: () => void;
  tone?: 'default' | 'accent';
  testID?: string;
};

export function IconButton({ icon, accessibilityLabel, onPress, tone = 'default', testID }: IconButtonProps) {
  const accent = tone === 'accent';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        accent && { backgroundColor: colors.accentSoft, borderColor: colors.accent },
        pressed && { backgroundColor: colors.surfacePressed },
      ]}>
      <Ionicons name={icon} size={22} color={accent ? colors.accent : colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: minTouchSize,
    height: minTouchSize,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
