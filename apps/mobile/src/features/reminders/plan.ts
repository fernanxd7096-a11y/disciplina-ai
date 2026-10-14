/**
 * Planificador de notificaciones (funciones puras).
 *
 * desiredNotifications() calcula, a partir de los datos del usuario, qué avisos
 * deberían estar programados en el teléfono durante los próximos días.
 * reconcile() compara eso con lo que el teléfono tiene programado y devuelve
 * qué cancelar y qué programar. Cada aviso tiene un identificador estable que
 * incluye su hora: si un evento cambia de hora, el aviso viejo se cancela y se
 * crea uno nuevo; si nada cambió, no se toca nada. Nunca hay duplicados.
 */
import { addDays, dayOfWeek, isDayDone, isScheduled } from '@/features/habits/logic';
import type { Habit, HabitLog } from '@/features/habits/types';
import { zonedToUtcIso } from '@/features/tasks/logic';
import type { Task } from '@/features/tasks/types';
import { localDayKey } from '@/lib/dates';
import type { CalendarEvent, Reminder } from '@/features/events/types';

export const ID_PREFIX = 'dai:';
export const WINDOW_DAYS = 14;
/** Android limita las alarmas por app; nos quedamos muy por debajo. */
export const MAX_SCHEDULED = 60;

export type Channel = 'events' | 'tasks' | 'habits';

export type PlannedNotification = {
  id: string;
  fireAt: Date;
  title: string;
  body: string;
  channel: Channel;
  /** Ruta a abrir al tocar la notificación. */
  url: string;
};

export type NotificationPrefs = {
  habit_reminders: boolean;
  task_reminders: boolean;
  quiet_start: string | null;
  quiet_end: string | null;
};

type Input = {
  now: Date;
  timeZone: string;
  events: CalendarEvent[];
  reminders: Reminder[];
  tasks: Task[];
  habits: Habit[];
  habitLogs: HabitLog[];
  restDays: string[];
  prefs: NotificationPrefs;
};

function timeLabel(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('es-PE', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** ¿Cae en horas de silencio? (el rango puede cruzar medianoche, p. ej. 23:00–07:00) */
export function inQuietHours(fireAt: Date, prefs: NotificationPrefs, tz: string): boolean {
  if (!prefs.quiet_start || !prefs.quiet_end) return false;
  const t = minutesOf(timeLabel(fireAt.toISOString(), tz));
  const s = minutesOf(prefs.quiet_start);
  const e = minutesOf(prefs.quiet_end);
  return s <= e ? t >= s && t < e : t >= s || t < e;
}

function offsetText(minutes: number): string {
  if (minutes === 0) return 'Empieza ahora';
  if (minutes < 60) return `En ${minutes} min`;
  if (minutes % 1440 === 0) return minutes === 1440 ? 'Mañana' : `En ${minutes / 1440} días`;
  return `En ${Math.round(minutes / 60)} h`;
}

export function desiredNotifications(input: Input): PlannedNotification[] {
  const { now, timeZone: tz, prefs } = input;
  const horizon = now.getTime() + WINDOW_DAYS * 86_400_000;
  const out: PlannedNotification[] = [];
  const inWindow = (d: Date) => d.getTime() > now.getTime() && d.getTime() <= horizon;

  const events = new Map(input.events.filter((e) => !e.deleted_at).map((e) => [e.id, e]));
  const tasks = new Map(input.tasks.filter((t) => !t.deleted_at && t.status !== 'done').map((t) => [t.id, t]));

  for (const r of input.reminders) {
    if (!r.enabled || r.deleted_at) continue;

    if (r.event_id) {
      const e = events.get(r.event_id);
      if (!e) continue;
      const fireAt = r.remind_at ? new Date(r.remind_at) : new Date(new Date(e.starts_at).getTime() - (r.offset_minutes ?? 0) * 60_000);
      if (!inWindow(fireAt)) continue;
      const when = e.all_day ? 'Todo el día' : `${timeLabel(e.starts_at, tz)}`;
      out.push({
        id: `${ID_PREFIX}event:${e.id}:${r.id}:${fireAt.getTime()}`,
        fireAt,
        title: e.title,
        body: [r.remind_at ? when : `${offsetText(r.offset_minutes ?? 0)} · ${when}`, e.location].filter(Boolean).join(' · '),
        channel: 'events',
        url: `/event/${e.id}`,
      });
    }

    if (r.task_id && prefs.task_reminders) {
      const t = tasks.get(r.task_id);
      if (!t || !t.due_at) continue;
      const fireAt = r.remind_at ? new Date(r.remind_at) : new Date(new Date(t.due_at).getTime() - (r.offset_minutes ?? 0) * 60_000);
      if (!inWindow(fireAt)) continue;
      out.push({
        id: `${ID_PREFIX}task:${t.id}:${r.id}:${fireAt.getTime()}`,
        fireAt,
        title: t.title,
        body: `Fecha límite ${timeLabel(t.due_at, tz)}`,
        channel: 'tasks',
        url: `/task/${t.id}`,
      });
    }
  }

  if (prefs.habit_reminders) {
    const today = localDayKey(now, tz);
    const rest = new Set(input.restDays);
    for (const h of input.habits) {
      if (h.status !== 'active' || h.deleted_at || !h.reminder_time) continue;
      const hhmm = h.reminder_time.slice(0, 5);
      for (let i = 0; i <= WINDOW_DAYS; i++) {
        const day = addDays(today, i);
        if (!isScheduled(h, day) || rest.has(day)) continue;
        if (h.frequency === 'daily' && !h.days_of_week.includes(dayOfWeek(day))) continue;
        // Si hoy ya lo cumpliste, no hace falta recordártelo.
        if (day === today) {
          const v = input.habitLogs.find((l) => l.habit_id === h.id && l.log_date === day)?.value;
          if (isDayDone(h, v)) continue;
        }
        const fireAt = new Date(zonedToUtcIso(day, hhmm, tz));
        if (!inWindow(fireAt)) continue;
        out.push({
          id: `${ID_PREFIX}habit:${h.id}:${day}:${hhmm}`,
          fireAt,
          title: h.name,
          body: h.target_per_period > 1 && h.frequency === 'daily' ? `Meta de hoy: ${h.target_per_period} ${h.unit ?? 'veces'}` : 'Es hora de tu hábito',
          channel: 'habits',
          url: `/habit/${h.id}`,
        });
      }
    }
  }

  return out
    .filter((n) => n.channel === 'events' || !inQuietHours(n.fireAt, prefs, tz)) // los eventos se avisan siempre
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
    .slice(0, MAX_SCHEDULED);
}

/** Qué cancelar y qué programar. Solo toca notificaciones creadas por esta app. */
export function reconcile(desired: PlannedNotification[], scheduledIds: string[]): { cancel: string[]; schedule: PlannedNotification[] } {
  const ours = scheduledIds.filter((id) => id.startsWith(ID_PREFIX));
  const want = new Set(desired.map((d) => d.id));
  const have = new Set(ours);
  return {
    cancel: ours.filter((id) => !want.has(id)),
    schedule: desired.filter((d) => !have.has(d.id)),
  };
}
