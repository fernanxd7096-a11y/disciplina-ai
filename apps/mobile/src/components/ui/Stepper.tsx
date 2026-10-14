import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

type StepperProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  suffix?: string;
};

/** Selector numérico accesible con botones − / +. */
export function Stepper({ label, value, min, max, onChange, suffix }: StepperProps) {
  return (
    <View style={styles.wrap}>
      <Text variant="label" color="textSecondary">
        {label}
      </Text>
      <View
        style={styles.row}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: value, text: `${value}${suffix ? ` ${suffix}` : ''}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment') onChange(Math.min(max, value + 1));
          if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(min, value - 1));
        }}>
        <IconButton icon="remove" accessibilityLabel={`Menos ${label}`} onPress={() => onChange(Math.max(min, value - 1))} />
        <View style={styles.value}>
          <Text variant="metric">{value}</Text>
          {suffix ? (
            <Text variant="caption" color="textSecondary">
              {suffix}
            </Text>
          ) : null}
        </View>
        <IconButton icon="add" accessibilityLabel={`Más ${label}`} onPress={() => onChange(Math.min(max, value + 1))} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
  },
  value: { flex: 1, alignItems: 'center' },
});
