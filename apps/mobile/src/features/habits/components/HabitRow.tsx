import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { categoryMeta } from '../presets';
import type { Habit } from '../types';
import { HabitCheck } from './HabitCheck';

type HabitRowProps = {
  habit: Habit;
  subtitle: string;
  value?: number;
  done?: boolean;
  /** Sin onToggle la fila no muestra botón (p. ej. hábitos pausados). */
  onToggle?: () => void;
  onOpen: () => void;
  streak?: number;
  first?: boolean;
};

export function HabitRow({ habit, subtitle, value = 0, done = false, onToggle, onOpen, streak, first }: HabitRowProps) {
  const meta = categoryMeta[habit.category ?? 'other'];
  const color = habit.color ?? meta.color;
  return (
    <View style={[styles.row, !first && styles.divider]}>
      <Pressable
        style={styles.main}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${habit.name}. ${subtitle}. Abrir detalle.`}>
        <View style={[styles.icon, { borderColor: color }]}>
          <Ionicons name={meta.icon} size={18} color={color} />
        </View>
        <View style={styles.text}>
          <Text variant="bodyStrong" numberOfLines={1} style={done && styles.doneText}>
            {habit.name}
          </Text>
          <View style={styles.meta}>
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {subtitle}
            </Text>
            {streak ? (
              <View style={styles.streak} accessibilityLabel={`Racha de ${streak}`}>
                <Ionicons name="flame" size={12} color={colors.warning} />
                <Text variant="caption" color="warning">
                  {streak}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
      {onToggle ? (
        <HabitCheck habit={habit} value={value} done={done} onPress={onToggle} color={color} testID={`check-${habit.id}`} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  icon: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  doneText: { color: colors.textSecondary },
});
