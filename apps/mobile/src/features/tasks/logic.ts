/**
 * Reglas de tareas (funciones puras). Las fechas límite se guardan en UTC
 * (timestamptz) y se interpretan en la zona horaria del perfil.
 */
import { localDayKey } from '@/lib/dates';
import type { Task, TaskPriority } from './types';

export const priorityMeta: Record<TaskPriority, { label: string; short: string; tone: 'danger' | 'warning' | 'accent' | 'neutral' }> = {
  1: { label: 'Urgente', short: 'P1', tone: 'danger' },
  2: { label: 'Alta', short: 'P2', tone: 'warning' },
  3: { label: 'Normal', short: 'P3', tone: 'accent' },
  4: { label: 'Baja', short: 'P4', tone: 'neutral' },
};

/** Una tarea está atrasada si no está hecha y su fecha límite ya pasó. */
export function isOverdue(task: Pick<Task, 'status' | 'due_at'>, now: Date): boolean {
  return task.status !== 'done' && task.due_at !== null && new Date(task.due_at).getTime() < now.getTime();
}

export type TaskGroupKey = 'overdue' | 'today' | 'upcoming' | 'someday' | 'done';

export const groupLabels: Record<TaskGroupKey, string> = {
  overdue: 'Atrasadas',
  today: 'Hoy',
  upcoming: 'Próximas',
  someday: 'Sin fecha',
  done: 'Completadas',
};

/**
 * Agrupa tareas para la lista. Orden dentro de cada grupo:
 * pendientes por fecha y luego prioridad; completadas, las más recientes primero.
 */
export function groupTasks(tasks: Task[], now: Date, timeZone: string): { key: TaskGroupKey; tasks: Task[] }[] {
  const todayKey = localDayKey(now, timeZone);
  const groups: Record<TaskGroupKey, Task[]> = { overdue: [], today: [], upcoming: [], someday: [], done: [] };

  for (const t of tasks) {
    if (t.deleted_at) continue;
    if (t.status === 'done') groups.done.push(t);
    else if (!t.due_at) groups.someday.push(t);
    else if (isOverdue(t, now)) groups.overdue.push(t);
    else if (localDayKey(new Date(t.due_at), timeZone) === todayKey) groups.today.push(t);
    else groups.upcoming.push(t);
  }

  const byDueThenPriority = (a: Task, b: Task) =>
    (a.due_at ?? '').localeCompare(b.due_at ?? '') || a.priority - b.priority || a.created_at.localeCompare(b.created_at);
  groups.overdue.sort(byDueThenPriority);
  groups.today.sort(byDueThenPriority);
  groups.upcoming.sort(byDueThenPriority);
  groups.someday.sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at));
  groups.done.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));

  return (Object.keys(groups) as TaskGroupKey[]).filter((k) => groups[k].length > 0).map((key) => ({ key, tasks: groups[key] }));
}

/**
 * Convierte "día local + hora local" de la zona del usuario a un instante UTC (ISO).
 * Funciona con cualquier zona IANA, incluidas las que tienen horario de verano.
 */
export function zonedToUtcIso(dayKey: string, time: string, timeZone: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  // Primer intento: tratar la hora local como si fuera UTC y corregir por el desfase de la zona.
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = (ms: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date(ms));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
    return asUtc - ms;
  };
  let ts = guess - offset(guess);
  ts = guess - offset(ts); // segunda pasada para cruces de horario de verano
  return new Date(ts).toISOString();
}

/** Hora local "HH:MM" de un instante en la zona dada. */
export function localTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

/** Días entre dos claves AAAA-MM-DD (b − a). */
function dayDiff(a: string, b: string): number {
  const utc = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export type QuickDue = 'today' | 'tomorrow' | 'nextWeek';

/**
 * Fecha límite rápida conservando la hora elegida (por defecto 23:59 local).
 * nextWeek = el próximo lunes.
 */
export function quickDue(option: QuickDue, now: Date, timeZone: string, time = '23:59'): string {
  const today = localDayKey(now, timeZone);
  let day = today;
  if (option === 'tomorrow') day = addDaysKey(today, 1);
  if (option === 'nextWeek') {
    const [y, m, d] = today.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    day = addDaysKey(today, ((8 - dow) % 7) || 7);
  }
  return zonedToUtcIso(day, time, timeZone);
}

/** "Hoy 18:00", "Mañana", "Ayer", "vie 17 oct", "Vencida hace 2 días". */
export function dueLabel(task: Pick<Task, 'due_at' | 'status'>, now: Date, timeZone: string): string | null {
  if (!task.due_at) return null;
  const due = new Date(task.due_at);
  const dueKey = localDayKey(due, timeZone);
  const todayKey = localDayKey(now, timeZone);
  const time = localTime(task.due_at, timeZone);
  const showTime = time !== '23:59';
  const diff = dayDiff(todayKey, dueKey);
  let day: string;
  if (diff === 0) day = 'Hoy';
  else if (diff === 1) day = 'Mañana';
  else if (diff === -1) day = 'Ayer';
  else
    day = new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', month: 'short', timeZone })
      .format(due)
      .replace(/[.,]/g, '');
  const label = showTime ? `${day} ${time}` : day;
  if (isOverdue(task, now) && diff < 0) return `Vencida · ${label}`;
  return label;
}
