/**
 * Calendario (funciones puras). Las vistas trabajan con días locales
 * "AAAA-MM-DD" en la zona horaria del perfil.
 */
import { localDayKey } from '@/lib/dates';
import { zonedToUtcIso } from '@/features/tasks/logic';
import type { CalendarEvent, ReminderDraft } from './types';

export function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function dow(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Lunes de la semana del día dado. */
export function mondayOf(key: string): string {
  return addDaysKey(key, -((dow(key) + 6) % 7));
}

/** ¿El evento ocupa (aunque sea en parte) ese día local? */
export function occursOn(e: Pick<CalendarEvent, 'starts_at' | 'ends_at'>, day: string, tz: string): boolean {
  const start = localDayKey(new Date(e.starts_at), tz);
  const end = localDayKey(new Date(e.ends_at), tz);
  return start <= day && day <= end;
}

/** Eventos de un día, de todo el día primero y luego por hora de inicio. */
export function eventsOnDay(events: CalendarEvent[], day: string, tz: string): CalendarEvent[] {
  return events
    .filter((e) => !e.deleted_at && occursOn(e, day, tz))
    .sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.starts_at.localeCompare(b.starts_at));
}

/**
 * Cuadrícula del mes: semanas de lunes a domingo, incluyendo días
 * del mes anterior/siguiente para completar filas.
 */
export function monthGrid(monthKey: string): { day: string; inMonth: boolean }[][] {
  const month = monthKey.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // día 0 del mes siguiente
  const weeks: { day: string; inMonth: boolean }[][] = [];
  for (let start = mondayOf(first); start <= last; start = addDaysKey(start, 7)) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const day = addDaysKey(start, i);
        return { day, inMonth: day.slice(0, 7) === month };
      }),
    );
  }
  return weeks;
}

export function shiftMonth(monthKey: string, n: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** Opciones de recordatorio de la especificación. */
export const reminderOptions: { minutes: number; label: string }[] = [
  { minutes: 0, label: 'Al empezar' },
  { minutes: 15, label: '15 min antes' },
  { minutes: 60, label: '1 hora antes' },
  { minutes: 1440, label: '1 día antes' },
];

export function reminderLabel(r: ReminderDraft, tz: string): string {
  if (r.remind_at) {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: tz,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .format(new Date(r.remind_at))
      .replace(/[.,]/g, '');
  }
  const opt = reminderOptions.find((o) => o.minutes === r.offset_minutes);
  if (opt) return opt.label;
  const mins = r.offset_minutes ?? 0;
  if (mins % 1440 === 0) return `${mins / 1440} días antes`;
  if (mins % 60 === 0) return `${mins / 60} h antes`;
  return `${mins} min antes`;
}

/** Normaliza un evento de todo el día: 00:00 del primer día a 23:59 del último, en la zona del usuario. */
export function allDayRange(startDay: string, endDay: string, tz: string): { starts_at: string; ends_at: string } {
  return { starts_at: zonedToUtcIso(startDay, '00:00', tz), ends_at: zonedToUtcIso(endDay, '23:59', tz) };
}

/** Diferencia entre la lista guardada y la editada: qué borrar y qué crear. */
export function diffReminders<T extends ReminderDraft & { id?: string }>(
  saved: T[],
  drafts: ReminderDraft[],
): { remove: T[]; add: ReminderDraft[] } {
  const keyOf = (r: ReminderDraft) => (r.remind_at ? `at:${new Date(r.remind_at).toISOString()}` : `off:${r.offset_minutes}`);
  const draftKeys = new Set(drafts.map(keyOf));
  const savedKeys = new Set(saved.map(keyOf));
  const seen = new Set<string>();
  return {
    remove: saved.filter((r) => !draftKeys.has(keyOf(r))),
    add: drafts.filter((d) => {
      const k = keyOf(d);
      if (savedKeys.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    }),
  };
}

/**
 * Evento en curso o el siguiente que empieza después de `now`.
 * Los de todo el día solo cuentan si son hoy (no "tapan" a los de hora concreta).
 */
export function nextEvent(events: CalendarEvent[], now: Date, tz: string): { event: CalendarEvent; ongoing: boolean } | null {
  const t = now.getTime();
  const today = localDayKey(now, tz);
  const candidates = events
    .filter((e) => !e.deleted_at && new Date(e.ends_at).getTime() > t)
    .filter((e) => !e.all_day || occursOn(e, today, tz))
    .sort((a, b) => Number(a.all_day) - Number(b.all_day) || a.starts_at.localeCompare(b.starts_at));
  const timed = candidates.find((e) => !e.all_day);
  const pick = timed ?? candidates[0];
  if (!pick) return null;
  return { event: pick, ongoing: new Date(pick.starts_at).getTime() <= t };
}
