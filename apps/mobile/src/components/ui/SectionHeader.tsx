import { Pressable, StyleSheet, View } from 'react-native';

import { minTouchSize, spacing } from '@/theme';
import { Text } from './Text';

type SectionHeaderProps = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text variant="label" color="textSecondary" accessibilityRole="header">
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={12} style={styles.action}>
          <Text variant="caption" color="accent">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 24 },
  action: { minHeight: minTouchSize / 2, justifyContent: 'center', paddingLeft: spacing.sm },
});
