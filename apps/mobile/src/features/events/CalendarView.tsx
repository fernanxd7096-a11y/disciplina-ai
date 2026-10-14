import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, ErrorState, IconButton, LoadingState, SegmentedControl, Text } from '@/components/ui';
import { weekDays } from '@/features/habits/presets';
import { useUserTimeZone } from '@/features/profile/api';
import { localDayKey } from '@/lib/dates';
import { colors, radius, spacing } from '@/theme';
import { useEvents, useReminders } from './api';
import { EventRow } from './EventRow';
import { addDaysKey, eventsOnDay, mondayOf, monthGrid, shiftMonth } from './logic';
import type { CalendarEvent } from './types';

type Mode = 'month' | 'week' | 'day';

function dayTitle(day: string, tz: string, opts: Intl.DateTimeFormatOptions) {
  // Mediodía UTC del día: evita que el formato cambie de fecha por la zona.
  const text = new Intl.DateTimeFormat('es-PE', { ...opts, timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
  return text.charAt(0).toUpperCase() + text.slice(1).replace(/\./g, '');
}

export function CalendarView() {
  const tz = useUserTimeZone();
  const today = localDayKey(new Date(), tz);
  const [mode, setMode] = useState<Mode>('month');
  const [selected, setSelected] = useState(today);
  const events = useEvents();
  const reminders = useReminders();

  const remindersByEvent = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reminders.data ?? []) if (r.event_id) m.set(r.event_id, (m.get(r.event_id) ?? 0) + 1);
    return m;
  }, [reminders.data]);

  const list = events.data ?? [];
  const openEvent = (e: CalendarEvent) => router.push({ pathname: '/event/[id]', params: { id: e.id } });
  const newEvent = () => router.push({ pathname: '/event/new', params: { date: selected } });

  if (events.isLoading) return <LoadingState label="Cargando calendario…" />;
  if (events.error && !events.data) {
    return <ErrorState message="No se pudo cargar tu calendario. Revisa tu conexión." onRetry={() => events.refetch()} />;
  }

  function shift(n: number) {
    if (mode === 'month') setSelected((d) => `${shiftMonth(d.slice(0, 7), n)}-01`);
    else setSelected((d) => addDaysKey(d, mode === 'week' ? 7 * n : n));
  }

  const header =
    mode === 'month'
      ? dayTitle(selected, tz, { month: 'long', year: 'numeric' })
      : mode === 'week'
        ? `Semana del ${dayTitle(mondayOf(selected), tz, { day: 'numeric', month: 'short' })}`
        : dayTitle(selected, tz, { weekday: 'long', day: 'numeric', month: 'long' });

  const dayList = (day: string) => {
    const items = eventsOnDay(list, day, tz);
    return items.length ? (
      items.map((e) => (
        <EventRow key={e.id} event={e} day={day} timeZone={tz} reminderCount={remindersByEvent.get(e.id) ?? 0} onPress={() => openEvent(e)} />
      ))
    ) : (
      <Text variant="caption" color="textMuted">
        Sin eventos
      </Text>
    );
  };

  return (
    <View style={styles.wrap} testID="calendar-view">
      <SegmentedControl
        accessibilityLabel="Vista del calendario"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'month', label: 'Mes' },
          { value: 'week', label: 'Semana' },
          { value: 'day', label: 'Día' },
        ]}
      />

      <View style={styles.nav}>
        <IconButton icon="chevron-back" accessibilityLabel="Anterior" onPress={() => shift(-1)} />
        <Text variant="heading" style={styles.navTitle} accessibilityRole="header" testID="calendar-title">
          {header}
        </Text>
        <IconButton icon="chevron-forward" accessibilityLabel="Siguiente" onPress={() => shift(1)} />
      </View>
      {selected !== today ? <Button label="Ir a hoy" variant="ghost" onPress={() => setSelected(today)} /> : null}

      {mode === 'month' ? (
        <>
          <Card>
            <View style={styles.weekRow}>
              {weekDays.map((d) => (
                <Text key={d.value} variant="caption" color="textMuted" style={styles.cellHead}>
                  {d.short}
                </Text>
              ))}
            </View>
            {monthGrid(selected.slice(0, 7)).map((week) => (
              <View key={week[0].day} style={styles.weekRow}>
                {week.map(({ day, inMonth }) => {
                  const count = eventsOnDay(list, day, tz).length;
                  const isSel = day === selected;
                  return (
                    <Pressable
                      key={day}
                      onPress={() => setSelected(day)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSel }}
                      accessibilityLabel={`${dayTitle(day, tz, { weekday: 'long', day: 'numeric', month: 'long' })}${count ? `, ${count} ${count === 1 ? 'evento' : 'eventos'}` : ''}`}
                      style={[styles.cell, isSel && styles.cellSelected, day === today && !isSel && styles.cellToday]}
                      testID={`day-${day}`}>
                      <Text variant="caption" color={isSel ? 'textOnAccent' : inMonth ? 'text' : 'textMuted'} style={day === today && styles.bold}>
                        {Number(day.slice(8))}
                      </Text>
                      <View style={[styles.dot, { backgroundColor: count ? (isSel ? colors.textOnAccent : colors.events) : 'transparent' }]} />
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </Card>
          <Text variant="label" color="textSecondary">
            {dayTitle(selected, tz, { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          <Card>{dayList(selected)}</Card>
        </>
      ) : null}

      {mode === 'week'
        ? Array.from({ length: 7 }, (_, i) => addDaysKey(mondayOf(selected), i)).map((day) => (
            <View key={day} style={styles.weekDay}>
              <Pressable onPress={() => { setSelected(day); setMode('day'); }} accessibilityRole="button">
                <Text variant="label" color={day === today ? 'accent' : 'textSecondary'}>
                  {dayTitle(day, tz, { weekday: 'long', day: 'numeric' })}
                  {day === today ? ' · hoy' : ''}
                </Text>
              </Pressable>
              <Card>{dayList(day)}</Card>
            </View>
          ))
        : null}

      {mode === 'day' ? <Card>{dayList(selected)}</Card> : null}

      <Button label="Nuevo evento" icon="add" variant="secondary" onPress={newEvent} fullWidth testID="new-event" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  nav: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  navTitle: { flex: 1, textAlign: 'center' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cellHead: { flex: 1, textAlign: 'center' },
  cell: { flex: 1, aspectRatio: 1, maxHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, gap: 2 },
  cellSelected: { backgroundColor: colors.accent },
  cellToday: { borderWidth: 1, borderColor: colors.accent },
  bold: { fontWeight: '700' },
  dot: { width: 5, height: 5, borderRadius: 3 },
  weekDay: { gap: spacing.xs },
});
