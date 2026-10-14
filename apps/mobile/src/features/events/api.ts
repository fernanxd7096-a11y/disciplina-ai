import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSessionClient } from '@/features/auth/AuthProvider';
import { diffReminders } from './logic';
import type { CalendarEvent, EventInput, Reminder, ReminderDraft } from './types';

const EVENT_COLS = 'id, user_id, title, starts_at, ends_at, all_day, location, notes, timezone, category_id, created_at, updated_at, deleted_at';
const REMINDER_COLS = 'id, user_id, event_id, task_id, offset_minutes, remind_at, enabled, deleted_at';

export const eventKeys = {
  all: (uid: string) => ['events', uid] as const,
  reminders: (uid: string) => ['reminders', uid] as const,
  prefs: (uid: string) => ['notificationPrefs', uid] as const,
};

/** Eventos desde hace 60 días en adelante (suficiente para las vistas y los avisos). */
export function useEvents() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: eventKeys.all(user.id),
    queryFn: async (): Promise<CalendarEvent[]> => {
      const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
      const { data, error } = await client
        .from('events')
        .select(EVENT_COLS)
        .is('deleted_at', null)
        .gte('ends_at', since)
        .order('starts_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CalendarEvent[];
    },
  });
}

export function useReminders() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: eventKeys.reminders(user.id),
    queryFn: async (): Promise<Reminder[]> => {
      const { data, error } = await client.from('reminders').select(REMINDER_COLS).is('deleted_at', null);
      if (error) throw error;
      return (data ?? []) as Reminder[];
    },
  });
}

export type NotificationPrefsRow = {
  user_id: string;
  default_event_offsets: number[];
  habit_reminders: boolean;
  task_reminders: boolean;
  quiet_start: string | null;
  quiet_end: string | null;
};

export function useNotificationPrefs() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: eventKeys.prefs(user.id),
    queryFn: async (): Promise<NotificationPrefsRow> => {
      const { data, error } = await client
        .from('notification_prefs')
        .select('user_id, default_event_offsets, habit_reminders, task_reminders, quiet_start, quiet_end')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      // El trigger de registro crea la fila; si faltara, se usan los valores por defecto de la tabla.
      return (
        (data as NotificationPrefsRow | null) ?? {
          user_id: user.id,
          default_event_offsets: [15, 60],
          habit_reminders: true,
          task_reminders: true,
          quiet_start: null,
          quiet_end: null,
        }
      );
    },
  });
}

export function useUpdateNotificationPrefs() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<NotificationPrefsRow, 'user_id'>>) => {
      const { data, error } = await client
        .from('notification_prefs')
        .update(patch)
        .eq('user_id', user.id)
        .select('user_id, default_event_offsets, habit_reminders, task_reminders, quiet_start, quiet_end')
        .single();
      if (error) throw error;
      return data as NotificationPrefsRow;
    },
    onSuccess: (row) => qc.setQueryData(eventKeys.prefs(user.id), row),
  });
}

/**
 * Crea o actualiza un evento y deja sus recordatorios exactamente como
 * en el formulario (borra los quitados, crea los nuevos, no duplica).
 */
export function useSaveEvent() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input, reminders }: { id?: string; input: EventInput; reminders: ReminderDraft[] }) => {
      const clean = {
        ...input,
        title: input.title.trim(),
        location: input.location?.trim() || null,
        notes: input.notes?.trim() || null,
      };
      const res = id
        ? await client.from('events').update(clean).eq('id', id).select(EVENT_COLS).single()
        : await client.from('events').insert(clean).select(EVENT_COLS).single();
      if (res.error) throw res.error;
      const event = res.data as CalendarEvent;

      const saved = (qc.getQueryData<Reminder[]>(eventKeys.reminders(user.id)) ?? []).filter((r) => r.event_id === event.id);
      const { remove, add } = diffReminders(saved, reminders);
      if (remove.length) {
        const { error } = await client.from('reminders').delete().in('id', remove.map((r) => r.id));
        if (error) throw error;
      }
      if (add.length) {
        const { error } = await client.from('reminders').insert(add.map((r) => ({ ...r, event_id: event.id })));
        if (error) throw error;
      }
      return event;
    },
    onSuccess: (event) => {
      qc.setQueryData<CalendarEvent[]>(eventKeys.all(user.id), (old = []) =>
        [...old.filter((e) => e.id !== event.id), event].sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
      );
      void qc.invalidateQueries({ queryKey: eventKeys.reminders(user.id) });
    },
  });
}

/** Borrar un evento: los recordatorios se borran en cascada en la base. */
export function useDeleteEvent() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.from('events').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      qc.setQueryData<CalendarEvent[]>(eventKeys.all(user.id), (old = []) => old.filter((e) => e.id !== id));
      qc.setQueryData<Reminder[]>(eventKeys.reminders(user.id), (old = []) => old.filter((r) => r.event_id !== id));
    },
  });
}
