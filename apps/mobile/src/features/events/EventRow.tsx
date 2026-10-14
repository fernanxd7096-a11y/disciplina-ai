import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { localTime } from '@/features/tasks/logic';
import { localDayKey } from '@/lib/dates';
import { colors, minTouchSize, radius, spacing } from '@/theme';
import type { CalendarEvent } from './types';

type EventRowProps = {
  event: CalendarEvent;
  day: string;
  timeZone: string;
  reminderCount: number;
  onPress: () => void;
};

export function EventRow({ event, day, timeZone, reminderCount, onPress }: EventRowProps) {
  const startDay = localDayKey(new Date(event.starts_at), timeZone);
  const endDay = localDayKey(new Date(event.ends_at), timeZone);
  const time = event.all_day
    ? 'Todo el día'
    : startDay === day && endDay === day
      ? `${localTime(event.starts_at, timeZone)} – ${localTime(event.ends_at, timeZone)}`
      : startDay === day
        ? `Desde ${localTime(event.starts_at, timeZone)}`
        : endDay === day
          ? `Hasta ${localTime(event.ends_at, timeZone)}`
          : 'Todo el día';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}. ${time}.${event.location ? ` En ${event.location}.` : ''} Abrir evento.`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfacePressed }]}
      testID={`event-${event.id}`}>
      <View style={styles.bar} />
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {event.title}
        </Text>
        <View style={styles.meta}>
          <Text variant="caption" color="textSecondary">
            {time}
          </Text>
          {event.location ? (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={12} color={colors.textMuted} />
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {event.location}
              </Text>
            </View>
          ) : null}
          {reminderCount > 0 ? <Ionicons name="notifications-outline" size={12} color={colors.textMuted} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'stretch',
    minHeight: minTouchSize,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
  },
  bar: { width: 3, borderRadius: 2, backgroundColor: colors.events },
  text: { flex: 1, gap: 2, justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 },
});
