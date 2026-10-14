import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { ProgressRing, Text } from '@/components/ui';
import { colors, minTouchSize } from '@/theme';
import type { Habit } from '../types';

type HabitCheckProps = {
  habit: Pick<Habit, 'name' | 'frequency' | 'target_per_period' | 'unit'>;
  value: number;
  done: boolean;
  onPress: () => void;
  color?: string;
  testID?: string;
};

/**
 * Botón de marcar hábito. Hábitos simples: check. Contadores (p. ej. 8 vasos):
 * anillo de progreso con el valor actual; cada toque suma uno.
 */
export function HabitCheck({ habit, value, done, onPress, color = colors.accent, testID }: HabitCheckProps) {
  const counter = habit.frequency === 'daily' && habit.target_per_period > 1;
  const label = counter
    ? `${habit.name}: ${value} de ${habit.target_per_period}${habit.unit ? ` ${habit.unit}` : ''}. Tocar para sumar uno.`
    : `${habit.name}: ${done ? 'hecho. Tocar para desmarcar.' : 'pendiente. Tocar para marcar como hecho.'}`;

  function press() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  }

  return (
    <Pressable
      onPress={press}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ checked: done }}
      hitSlop={6}
      testID={testID}
      style={styles.hit}>
      {counter ? (
        <ProgressRing value={value} total={habit.target_per_period} size={44} strokeWidth={4} color={color} accessibilityLabel="">
          {done ? (
            <Ionicons name="checkmark" size={20} color={color} />
          ) : (
            <Text variant="caption" color="text" style={styles.count}>
              {value}
            </Text>
          )}
        </ProgressRing>
      ) : (
        <View style={[styles.circle, { borderColor: done ? color : colors.borderStrong }, done && { backgroundColor: color }]}>
          {done ? <Ionicons name="checkmark" size={22} color={colors.textOnAccent} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { width: minTouchSize, height: minTouchSize, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  count: { fontWeight: '700' },
});
