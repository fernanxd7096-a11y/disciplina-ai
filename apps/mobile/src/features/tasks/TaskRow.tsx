import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors, minTouchSize, spacing } from '@/theme';
import { dueLabel, isOverdue, priorityMeta } from './logic';
import type { Task } from './types';

const priorityColor: Record<number, string> = {
  1: colors.danger,
  2: colors.warning,
  3: colors.accent,
  4: colors.textMuted,
};

type TaskRowProps = {
  task: Task;
  now: Date;
  timeZone: string;
  onToggle: () => void;
  onOpen: () => void;
  first?: boolean;
};

export function TaskRow({ task, now, timeZone, onToggle, onOpen, first }: TaskRowProps) {
  const done = task.status === 'done';
  const overdue = isOverdue(task, now);
  const due = dueLabel(task, now, timeZone);
  const color = priorityColor[task.priority];

  return (
    <View style={[styles.row, !first && styles.divider]}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onToggle();
        }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`${task.title}. ${done ? 'Completada. Tocar para reabrir.' : 'Pendiente. Tocar para completar.'}`}
        hitSlop={6}
        style={styles.checkHit}
        testID={`task-check-${task.id}`}>
        <View style={[styles.check, { borderColor: done ? colors.success : color }, done && styles.checkDone]}>
          {done ? <Ionicons name="checkmark" size={16} color={colors.textOnAccent} /> : null}
        </View>
      </Pressable>
      <Pressable
        style={styles.main}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${task.title}. Prioridad ${priorityMeta[task.priority].label}.${due ? ` ${due}.` : ''} Abrir.`}
        testID={`task-row-${task.id}`}>
        <Text variant="body" numberOfLines={2} style={done && styles.doneText}>
          {task.title}
        </Text>
        {due || task.priority <= 2 ? (
          <View style={styles.meta}>
            {due ? (
              <View style={styles.metaItem}>
                <Ionicons name={overdue ? 'alert-circle' : 'calendar-outline'} size={12} color={overdue ? colors.danger : colors.textMuted} />
                <Text variant="caption" color={overdue ? 'danger' : 'textMuted'}>
                  {due}
                </Text>
              </View>
            ) : null}
            {task.priority <= 2 && !done ? (
              <View style={styles.metaItem}>
                <Ionicons name="flag" size={12} color={color} />
                <Text variant="caption" color={task.priority === 1 ? 'danger' : 'warning'}>
                  {priorityMeta[task.priority].label}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm },
  checkHit: { width: minTouchSize, height: minTouchSize, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkDone: { backgroundColor: colors.success },
  main: { flex: 1, minHeight: minTouchSize, justifyContent: 'center', gap: 2, paddingVertical: spacing.xs },
  doneText: { color: colors.textMuted, textDecorationLine: 'line-through' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
