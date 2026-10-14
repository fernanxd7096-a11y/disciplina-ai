import { dueLabel, groupTasks, isOverdue, localTime, quickDue, zonedToUtcIso } from '../logic';
import type { Task } from '../types';

const TZ = 'America/Lima'; // UTC-5, sin horario de verano
// martes 13 oct 2026, 21:39 en Lima
const now = new Date('2026-10-14T02:39:00Z');

function task(over: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2),
    user_id: 'u1',
    title: 't',
    description: null,
    priority: 3,
    due_at: null,
    status: 'todo',
    completed_at: null,
    rescheduled_count: 0,
    category_id: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

describe('zonedToUtcIso / localTime', () => {
  it('convierte hora de Lima a UTC y de vuelta', () => {
    expect(zonedToUtcIso('2026-10-15', '17:00', TZ)).toBe('2026-10-15T22:00:00.000Z');
    expect(localTime('2026-10-15T22:00:00.000Z', TZ)).toBe('17:00');
  });

  it('respeta el horario de verano de otras zonas', () => {
    // Madrid: verano UTC+2, invierno UTC+1 (cambio el 25 oct 2026)
    expect(zonedToUtcIso('2026-10-20', '09:00', 'Europe/Madrid')).toBe('2026-10-20T07:00:00.000Z');
    expect(zonedToUtcIso('2026-10-30', '09:00', 'Europe/Madrid')).toBe('2026-10-30T08:00:00.000Z');
  });
});

describe('isOverdue', () => {
  it('pendiente con fecha pasada = atrasada; hecha nunca', () => {
    expect(isOverdue(task({ due_at: '2026-10-13T20:00:00Z' }), now)).toBe(true);
    expect(isOverdue(task({ due_at: '2026-10-13T20:00:00Z', status: 'done', completed_at: 'x' }), now)).toBe(false);
    expect(isOverdue(task({ due_at: '2026-10-15T20:00:00Z' }), now)).toBe(false);
    expect(isOverdue(task({ due_at: null }), now)).toBe(false);
  });
});

describe('groupTasks', () => {
  it('separa atrasadas, hoy, próximas, sin fecha y hechas usando el día local', () => {
    const tasks = [
      task({ id: 'atrasada', due_at: '2026-10-12T15:00:00Z' }),
      // 23:59 de hoy en Lima = 04:59 UTC del 14: sigue siendo "hoy" aunque en UTC ya sea mañana
      task({ id: 'hoy', due_at: '2026-10-14T04:59:00Z' }),
      task({ id: 'manana-p1', due_at: '2026-10-15T04:59:00Z', priority: 1 }),
      task({ id: 'manana-p3', due_at: '2026-10-15T04:59:00Z', priority: 3 }),
      task({ id: 'sin-fecha' }),
      task({ id: 'hecha', status: 'done', completed_at: '2026-10-13T10:00:00Z' }),
      task({ id: 'borrada', deleted_at: '2026-10-13T10:00:00Z' }),
    ];
    const groups = groupTasks(tasks, now, TZ);
    expect(groups.map((g) => [g.key, g.tasks.map((t) => t.id)])).toEqual([
      ['overdue', ['atrasada']],
      ['today', ['hoy']],
      ['upcoming', ['manana-p1', 'manana-p3']],
      ['someday', ['sin-fecha']],
      ['done', ['hecha']],
    ]);
  });

  it('omite grupos vacíos', () => {
    expect(groupTasks([], now, TZ)).toEqual([]);
  });
});

describe('quickDue', () => {
  it('hoy, mañana y el próximo lunes a las 23:59 locales', () => {
    expect(quickDue('today', now, TZ)).toBe('2026-10-14T04:59:00.000Z');
    expect(quickDue('tomorrow', now, TZ)).toBe('2026-10-15T04:59:00.000Z');
    expect(quickDue('nextWeek', now, TZ)).toBe('2026-10-20T04:59:00.000Z'); // lunes 19
  });
});

describe('dueLabel', () => {
  it('muestra etiquetas relativas en español', () => {
    expect(dueLabel(task({ due_at: '2026-10-14T04:59:00Z' }), now, TZ)).toBe('Hoy');
    expect(dueLabel(task({ due_at: '2026-10-14T23:00:00Z' }), now, TZ)).toBe('Mañana 18:00');
    expect(dueLabel(task({ due_at: '2026-10-12T15:00:00Z' }), now, TZ)).toBe('Vencida · Ayer 10:00');
    expect(dueLabel(task({ due_at: null }), now, TZ)).toBeNull();
    expect(dueLabel(task({ due_at: '2026-10-17T04:59:00Z' }), now, TZ)).toMatch(/vie 16 oct/i);
  });
});
