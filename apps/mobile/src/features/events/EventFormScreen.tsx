import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { Button, Chip, DateTimeField, Notice, Screen, Text, TextField } from '@/components/ui';
import { useUserTimeZone } from '@/features/profile/api';
import { getPermission, requestPermission } from '@/features/reminders/notifications';
import { localTime, zonedToUtcIso } from '@/features/tasks/logic';
import { localDayKey } from '@/lib/dates';
import { spacing } from '@/theme';
import { useDeleteEvent, useNotificationPrefs, useReminders, useSaveEvent } from './api';
import { allDayRange, reminderLabel, reminderOptions } from './logic';
import type { CalendarEvent, ReminderDraft } from './types';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/planner');
}

function confirmDelete(): Promise<boolean> {
  const msg = 'El evento y sus avisos se eliminarán.';
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(msg) ?? true);
  return new Promise((resolve) =>
    Alert.alert('Eliminar evento', msg, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Eliminar', style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

function fmtDate(iso: string, tz: string) {
  return new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz })
    .format(new Date(iso))
    .replace(/[.,]/g, '');
}

/** Hora redondeada a la siguiente media hora, para eventos nuevos. */
function nextHalfHour(day: string, tz: string): string {
  const now = new Date();
  const today = localDayKey(now, tz);
  if (day !== today) return zonedToUtcIso(day, '09:00', tz);
  const ms = 30 * 60_000;
  return new Date(Math.ceil(now.getTime() / ms) * ms).toISOString();
}

export function EventFormScreen({ event, initialDay }: { event?: CalendarEvent; initialDay?: string }) {
  const tz = useUserTimeZone();
  const prefs = useNotificationPrefs();
  const allReminders = useReminders();
  const save = useSaveEvent();
  const remove = useDeleteEvent();

  const day0 = initialDay ?? localDayKey(new Date(), tz);
  const start0 = event?.starts_at ?? nextHalfHour(day0, tz);
  const [title, setTitle] = useState(event?.title ?? '');
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [startsAt, setStartsAt] = useState(start0);
  const [endsAt, setEndsAt] = useState(event?.ends_at ?? new Date(new Date(start0).getTime() + 3_600_000).toISOString());
  const [location, setLocation] = useState(event?.location ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  // null = el usuario aún no tocó los avisos (se muestran los guardados o los predeterminados).
  const [reminders, setReminders] = useState<ReminderDraft[] | null>(null);
  const [errors, setErrors] = useState<{ title?: string; ends?: string }>({});
  const [permissionWarning, setPermissionWarning] = useState(false);

  // Avisos actuales: los guardados del evento, o los predeterminados del usuario para uno nuevo.
  const effectiveReminders: ReminderDraft[] =
    reminders ??
    (event
      ? (allReminders.data ?? [])
          .filter((r) => r.event_id === event.id)
          .map((r) => ({ offset_minutes: r.offset_minutes, remind_at: r.remind_at }))
      : (prefs.data?.default_event_offsets ?? [15, 60]).map((m) => ({ offset_minutes: m, remind_at: null })));

  function toggleOffset(minutes: number) {
    const has = effectiveReminders.some((r) => r.offset_minutes === minutes && !r.remind_at);
    setReminders(
      has
        ? effectiveReminders.filter((r) => !(r.offset_minutes === minutes && !r.remind_at))
        : [...effectiveReminders, { offset_minutes: minutes, remind_at: null }],
    );
  }

  function changeStart(day: string, time: string) {
    const next = zonedToUtcIso(day, allDay ? '00:00' : time, tz);
    const duration = new Date(endsAt).getTime() - new Date(startsAt).getTime();
    setStartsAt(next);
    // Conserva la duración al mover el inicio.
    setEndsAt(new Date(new Date(next).getTime() + Math.max(duration, allDay ? 0 : 3_600_000)).toISOString());
  }

  async function submit() {
    const e: typeof errors = {};
    if (!title.trim()) e.title = 'Ponle un nombre al evento.';
    let range = { starts_at: startsAt, ends_at: endsAt };
    if (allDay) range = allDayRange(localDayKey(new Date(startsAt), tz), localDayKey(new Date(endsAt), tz), tz);
    if (new Date(range.ends_at) < new Date(range.starts_at)) e.ends = 'El final no puede ser antes del inicio.';
    setErrors(e);
    if (Object.keys(e).length) return;

    if (effectiveReminders.length > 0) {
      const p = await getPermission().catch(() => 'undetermined' as const);
      const finalP = p === 'undetermined' ? await requestPermission().catch(() => 'denied' as const) : p;
      setPermissionWarning(finalP !== 'granted');
    }

    try {
      await save.mutateAsync({
        id: event?.id,
        input: { title, ...range, all_day: allDay, location, notes, timezone: tz },
        reminders: effectiveReminders,
      });
      goBack();
    } catch {
      // aviso con save.isError
    }
  }

  async function handleDelete() {
    if (!event || !(await confirmDelete())) return;
    try {
      await remove.mutateAsync(event.id);
      goBack();
    } catch {
      // aviso con remove.isError
    }
  }

  const customReminders = effectiveReminders.filter((r) => r.remind_at);

  return (
    <Screen testID="event-form-screen" edges={[]}>
      <Stack.Screen options={{ title: event ? 'Editar evento' : 'Nuevo evento' }} />

      <TextField label="Evento" value={title} onChangeText={setTitle} error={errors.title} placeholder="Ej.: Clase de redes" maxLength={120} autoFocus={!event} testID="event-title" />

      <View style={styles.row}>
        <Chip label="Todo el día" icon="sunny-outline" selected={allDay} onPress={() => setAllDay((v) => !v)} testID="event-all-day" />
      </View>

      <DateTimeField
        label="Inicio"
        value={startsAt}
        mode={allDay ? 'date' : 'datetime'}
        display={{ date: fmtDate(startsAt, tz), time: localTime(startsAt, tz) }}
        onChange={changeStart}
        testID="event-start"
      />
      <DateTimeField
        label="Fin"
        value={endsAt}
        mode={allDay ? 'date' : 'datetime'}
        display={{ date: fmtDate(endsAt, tz), time: localTime(endsAt, tz) }}
        onChange={(day, time) => setEndsAt(zonedToUtcIso(day, allDay ? '23:59' : time, tz))}
        testID="event-end"
      />
      {errors.ends ? (
        <Text variant="caption" color="danger">
          {errors.ends}
        </Text>
      ) : null}

      <TextField label="Ubicación (opcional)" value={location} onChangeText={setLocation} maxLength={200} />
      <TextField label="Notas (opcional)" value={notes} onChangeText={setNotes} multiline style={styles.multiline} textAlignVertical="top" maxLength={2000} />

      <View style={styles.block}>
        <Text variant="label" color="textSecondary">
          Avisos
        </Text>
        <View style={styles.wrap}>
          {reminderOptions.map((o) => (
            <Chip
              key={o.minutes}
              label={o.label}
              icon="notifications-outline"
              selected={effectiveReminders.some((r) => r.offset_minutes === o.minutes && !r.remind_at)}
              onPress={() => toggleOffset(o.minutes)}
              testID={`reminder-${o.minutes}`}
            />
          ))}
        </View>
        {customReminders.map((r) => (
          <View key={r.remind_at} style={styles.customRow}>
            <Text variant="body" style={styles.flex}>
              {reminderLabel(r, tz)}
            </Text>
            <Button label="Quitar" variant="ghost" onPress={() => setReminders(effectiveReminders.filter((x) => x !== r))} />
          </View>
        ))}
        <DateTimeField
          label="Añadir aviso a una hora exacta"
          value={null}
          display={null}
          onChange={(day, time) => setReminders([...effectiveReminders, { offset_minutes: null, remind_at: zonedToUtcIso(day, time, tz) }])}
          testID="event-custom-reminder"
        />
        <Text variant="caption" color="textMuted">
          Los avisos llegan aunque la app esté cerrada. No se duplican si editas el evento.
        </Text>
      </View>

      {permissionWarning ? (
        <Notice tone="info" message="Las notificaciones están desactivadas para la app. Actívalas en Ajustes para recibir estos avisos." />
      ) : null}
      {save.isError || remove.isError ? <Notice tone="error" message="No se pudo guardar. Revisa tu conexión e inténtalo de nuevo." /> : null}

      <Button label={event ? 'Guardar cambios' : 'Crear evento'} icon="checkmark" onPress={submit} loading={save.isPending} fullWidth testID="save-event" />
      {event ? <Button label="Eliminar evento" icon="trash-outline" variant="danger" onPress={handleDelete} loading={remove.isPending} testID="delete-event" /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  multiline: { minHeight: 80, paddingTop: spacing.md },
  block: { gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
