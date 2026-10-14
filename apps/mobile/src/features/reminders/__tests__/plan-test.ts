import type { CalendarEvent, Reminder } from '@/features/events/types';
import type { Habit } from '@/features/habits/types';
import type { Task } from '@/features/tasks/types';
import { desiredNotifications, ID_PREFIX, inQuietHours, MAX_SCHEDULED, reconcile, type NotificationPrefs } from '../plan';

const TZ = 'America/Lima';
// martes 13 oct 2026, 08:00 Lima = 13:00 UTC
const now = new Date('2026-10-13T13:00:00Z');
const prefs: NotificationPrefs = { habit_reminders: true, task_reminders: true, quiet_start: null, quiet_end: null };

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1',
  user_id: 'u',
  title: 'Clase de redes',
  starts_at: '2026-10-13T19:00:00Z', // 14:00 Lima
  ends_at: '2026-10-13T21:00:00Z',
  all_day: false,
  location: 'Aula 204',
  notes: null,
  timezone: TZ,
  category_id: null,
  created_at: '',
  updated_at: '',
  deleted_at: null,
  ...over,
});

const reminder = (over: Partial<Reminder> = {}): Reminder => ({
  id: 'r1',
  user_id: 'u',
  event_id: 'e1',
  task_id: null,
  offset_minutes: 15,
  remind_at: null,
  enabled: true,
  deleted_at: null,
  ...over,
});

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 'h1',
  user_id: 'u',
  name: 'Leer',
  icon: null,
  color: null,
  category: 'reading',
  frequency: 'daily',
  days_of_week: [0, 1, 2, 3, 4, 5, 6],
  target_per_period: 1,
  unit: null,
  reminder_time: '21:00:00',
  status: 'active',
  start_date: '2026-10-01',
  sort_order: 0,
  created_at: '',
  updated_at: '',
  deleted_at: null,
  ...over,
});

const base = { now, timeZone: TZ, events: [], reminders: [], tasks: [] as Task[], habits: [], habitLogs: [], restDays: [], prefs };

describe('desiredNotifications · eventos', () => {
  it('programa el aviso 15 min antes con texto útil', () => {
    const [n, ...rest] = desiredNotifications({ ...base, events: [event()], reminders: [reminder()] });
    expect(rest).toHaveLength(0);
    expect(n.fireAt.toISOString()).toBe('2026-10-13T18:45:00.000Z');
    expect(n.title).toBe('Clase de redes');
    expect(n.body).toBe('En 15 min · 14:00 · Aula 204');
    expect(n.channel).toBe('events');
    expect(n.url).toBe('/event/e1');
    expect(n.id.startsWith(ID_PREFIX)).toBe(true);
  });

  it('omite avisos pasados, de eventos borrados y desactivados', () => {
    const past = reminder({ id: 'r-past', offset_minutes: 10080 }); // una semana antes = ya pasó
    const off = reminder({ id: 'r-off', enabled: false });
    expect(desiredNotifications({ ...base, events: [event()], reminders: [past, off] })).toHaveLength(0);
    expect(desiredNotifications({ ...base, events: [event({ deleted_at: 'x' })], reminders: [reminder()] })).toHaveLength(0);
  });

  it('respeta la ventana de 14 días', () => {
    const lejano = event({ id: 'e2', starts_at: '2026-11-30T15:00:00Z', ends_at: '2026-11-30T16:00:00Z' });
    expect(desiredNotifications({ ...base, events: [lejano], reminders: [reminder({ event_id: 'e2' })] })).toHaveLength(0);
  });

  it('el id cambia si cambia la hora del evento (así se reprograma)', () => {
    const a = desiredNotifications({ ...base, events: [event()], reminders: [reminder()] })[0];
    const b = desiredNotifications({ ...base, events: [event({ starts_at: '2026-10-13T20:00:00Z' })], reminders: [reminder()] })[0];
    expect(a.id).not.toBe(b.id);
  });

  it('acepta hora exacta personalizada', () => {
    const [n] = desiredNotifications({
      ...base,
      events: [event()],
      reminders: [reminder({ offset_minutes: null, remind_at: '2026-10-13T16:30:00Z' })],
    });
    expect(n.fireAt.toISOString()).toBe('2026-10-13T16:30:00.000Z');
  });
});

describe('desiredNotifications · tareas', () => {
  const task: Task = {
    id: 't1', user_id: 'u', title: 'Entregar informe', description: null, priority: 2, due_at: '2026-10-14T22:00:00Z',
    status: 'todo', completed_at: null, rescheduled_count: 0, category_id: null, created_at: '', updated_at: '', deleted_at: null,
  };
  it('avisa antes de la fecha límite y no si está hecha o desactivado en preferencias', () => {
    const r = reminder({ event_id: null, task_id: 't1', offset_minutes: 60 });
    expect(desiredNotifications({ ...base, tasks: [task], reminders: [r] })).toHaveLength(1);
    expect(desiredNotifications({ ...base, tasks: [{ ...task, status: 'done', completed_at: 'x' }], reminders: [r] })).toHaveLength(0);
    expect(desiredNotifications({ ...base, tasks: [task], reminders: [r], prefs: { ...prefs, task_reminders: false } })).toHaveLength(0);
  });
});

describe('desiredNotifications · hábitos', () => {
  it('un aviso por día programado a la hora elegida, en la ventana', () => {
    const list = desiredNotifications({ ...base, habits: [habit()] });
    // ventana = 14 días exactos desde ahora (08:00): el 21:00 del día 14 ya queda fuera
    expect(list).toHaveLength(14);
    expect(list[0].fireAt.toISOString()).toBe('2026-10-14T02:00:00.000Z'); // 21:00 Lima del 13
  });

  it('solo los días elegidos, sin días de descanso, y no hoy si ya lo cumpliste', () => {
    const lmv = habit({ days_of_week: [1, 3, 5] });
    const days = desiredNotifications({
      ...base,
      habits: [lmv],
      restDays: ['2026-10-16'],
    }).map((n) => n.id.split(':')[3]);
    expect(days.slice(0, 3)).toEqual(['2026-10-14', '2026-10-19', '2026-10-21']); // mié 14, (vie 16 descanso), lun 19, mié 21

    const done = desiredNotifications({
      ...base,
      habits: [habit()],
      habitLogs: [{ id: 'l', user_id: 'u', habit_id: 'h1', log_date: '2026-10-13', value: 1, note: null }],
    });
    expect(done[0].id).toContain('2026-10-14');
  });

  it('nada si están desactivados, pausados o sin hora', () => {
    expect(desiredNotifications({ ...base, habits: [habit()], prefs: { ...prefs, habit_reminders: false } })).toHaveLength(0);
    expect(desiredNotifications({ ...base, habits: [habit({ status: 'paused' })] })).toHaveLength(0);
    expect(desiredNotifications({ ...base, habits: [habit({ reminder_time: null })] })).toHaveLength(0);
  });

  it('nunca supera el máximo de avisos programados', () => {
    const many = Array.from({ length: 10 }, (_, i) => habit({ id: `h${i}` }));
    expect(desiredNotifications({ ...base, habits: many })).toHaveLength(MAX_SCHEDULED);
  });
});

describe('horas de silencio', () => {
  const quiet = { ...prefs, quiet_start: '22:00', quiet_end: '07:00' };
  it('detecta rangos que cruzan medianoche', () => {
    expect(inQuietHours(new Date('2026-10-14T04:00:00Z'), quiet, TZ)).toBe(true); // 23:00 Lima
    expect(inQuietHours(new Date('2026-10-14T11:00:00Z'), quiet, TZ)).toBe(true); // 06:00
    expect(inQuietHours(new Date('2026-10-14T13:00:00Z'), quiet, TZ)).toBe(false); // 08:00
  });
  it('silencia hábitos pero nunca eventos', () => {
    const late = habit({ reminder_time: '23:00:00' });
    expect(desiredNotifications({ ...base, habits: [late], prefs: quiet })).toHaveLength(0);
    const lateEvent = event({ starts_at: '2026-10-14T04:15:00Z', ends_at: '2026-10-14T05:00:00Z' });
    expect(desiredNotifications({ ...base, events: [lateEvent], reminders: [reminder()], prefs: quiet })).toHaveLength(1);
  });
});

describe('reconcile', () => {
  const planned = desiredNotifications({ ...base, events: [event()], reminders: [reminder()] });

  it('programa lo que falta y no repite lo que ya está', () => {
    expect(reconcile(planned, []).schedule).toHaveLength(1);
    expect(reconcile(planned, [planned[0].id])).toEqual({ cancel: [], schedule: [] });
  });

  it('cancela avisos obsoletos (evento movido o borrado) pero no toca los de otras apps', () => {
    const r = reconcile([], [`${ID_PREFIX}event:e1:r1:123`, 'otra-app-aviso']);
    expect(r.cancel).toEqual([`${ID_PREFIX}event:e1:r1:123`]);
  });
});
