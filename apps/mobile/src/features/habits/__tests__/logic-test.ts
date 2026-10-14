import {
  addDays,
  buildContext,
  completionRate,
  dayOfWeek,
  isScheduled,
  nextValue,
  streaks,
  todayItems,
  todaySummary,
  weekStart,
} from '../logic';
import type { Habit, HabitLog } from '../types';

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    user_id: 'u1',
    name: 'Leer',
    icon: null,
    color: null,
    category: 'reading',
    frequency: 'daily',
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    target_per_period: 1,
    unit: null,
    reminder_time: null,
    status: 'active',
    start_date: '2026-10-01',
    sort_order: 0,
    created_at: '',
    updated_at: '',
    deleted_at: null,
    ...over,
  };
}

const logs = (habitId: string, days: string[], value = 1): HabitLog[] =>
  days.map((d, i) => ({ id: `${habitId}-${i}`, user_id: 'u1', habit_id: habitId, log_date: d, value, note: null }));

// Octubre 2026: el 1 es jueves; el 12 es lunes; el 13 es martes.
describe('fechas', () => {
  it('calcula día de la semana y lunes de la semana', () => {
    expect(dayOfWeek('2026-10-13')).toBe(2);
    expect(dayOfWeek('2026-10-11')).toBe(0);
    expect(weekStart('2026-10-13')).toBe('2026-10-12');
    expect(weekStart('2026-10-11')).toBe('2026-10-05');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('isScheduled', () => {
  it('respeta los días elegidos y la fecha de inicio', () => {
    const lmv = habit({ days_of_week: [1, 3, 5] });
    expect(isScheduled(lmv, '2026-10-12')).toBe(true); // lunes
    expect(isScheduled(lmv, '2026-10-13')).toBe(false); // martes
    expect(isScheduled(lmv, '2026-09-28')).toBe(false); // antes de empezar
  });
});

describe('streaks diarios', () => {
  it('cuenta días consecutivos cumplidos', () => {
    const h = habit();
    const ctx = buildContext(h, logs('h1', ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']), []);
    expect(streaks(h, ctx, '2026-10-13')).toEqual({ current: 4, best: 4, unit: 'días' });
  });

  it('hoy pendiente no rompe la racha', () => {
    const h = habit();
    const ctx = buildContext(h, logs('h1', ['2026-10-11', '2026-10-12']), []);
    expect(streaks(h, ctx, '2026-10-13').current).toBe(2);
  });

  it('un día programado sin cumplir corta la racha pero guarda la mejor', () => {
    const h = habit();
    const ctx = buildContext(h, logs('h1', ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-09', '2026-10-10']), []);
    expect(streaks(h, ctx, '2026-10-10')).toEqual({ current: 2, best: 3, unit: 'días' });
  });

  it('los días de descanso y los no programados no cortan', () => {
    const lmv = habit({ days_of_week: [1, 3, 5] });
    // Lun 5, Mié 7, (Vie 9 descanso), Lun 12
    const ctx = buildContext(lmv, logs('h1', ['2026-10-05', '2026-10-07', '2026-10-12']), ['2026-10-09']);
    expect(streaks(lmv, ctx, '2026-10-13').current).toBe(3);
  });

  it('un contador cuenta solo si alcanza la meta', () => {
    const agua = habit({ id: 'agua', target_per_period: 8, unit: 'vasos', category: 'water' });
    const ctx = buildContext(
      agua,
      [...logs('agua', ['2026-10-11', '2026-10-12'], 8), ...logs('agua', ['2026-10-13'], 5)],
      [],
    );
    expect(streaks(agua, ctx, '2026-10-13').current).toBe(2);
    expect(streaks(agua, ctx, '2026-10-14').current).toBe(0);
  });
});

describe('streaks semanales', () => {
  it('cuenta semanas que alcanzan la meta; la semana en curso no corta', () => {
    const gym = habit({ id: 'gym', frequency: 'weekly', target_per_period: 3, start_date: '2026-09-21' });
    const ctx = buildContext(
      gym,
      logs('gym', [
        '2026-09-22', '2026-09-24', '2026-09-26', // semana 21-27: 3 ✓
        '2026-09-29', '2026-10-01', '2026-10-03', // semana 28-4: 3 ✓
        '2026-10-06', // semana 5-11: 1 ✗
        '2026-10-12', '2026-10-13', // semana 12-18: 2 (en curso)
      ]),
      [],
    );
    expect(streaks(gym, ctx, '2026-10-13')).toEqual({ current: 0, best: 2, unit: 'semanas' });
  });
});

describe('completionRate', () => {
  it('días cumplidos / programados, sin contar hoy pendiente ni descansos', () => {
    const h = habit({ start_date: '2026-10-10' });
    const ctx = buildContext(h, logs('h1', ['2026-10-10', '2026-10-12']), ['2026-10-11']);
    // evaluables: 10 ✓, 12 ✓ (11 descanso, 13 hoy pendiente) → 100 %
    expect(completionRate(h, ctx, '2026-10-13', 30)).toBe(1);
  });

  it('null si aún no hay días evaluables (no inventa 0 %)', () => {
    const h = habit({ start_date: '2026-10-13' });
    expect(completionRate(h, buildContext(h, [], []), '2026-10-13')).toBeNull();
  });
});

describe('todayItems y resumen', () => {
  const leer = habit({ id: 'leer', sort_order: 1 });
  const gymLMV = habit({ id: 'gym', days_of_week: [1, 3, 5], sort_order: 2 });
  const pausado = habit({ id: 'p', status: 'paused' });
  const semanal = habit({ id: 'yoga', frequency: 'weekly', target_per_period: 2, sort_order: 3 });

  it('incluye solo activos programados hoy, pendientes primero', () => {
    const items = todayItems([leer, gymLMV, pausado, semanal], logs('leer', ['2026-10-13']), [], '2026-10-13');
    expect(items.map((i) => i.habit.id)).toEqual(['yoga', 'leer']);
    expect(todaySummary(items)).toEqual({ done: 1, total: 2 });
  });

  it('oculta el semanal cuando la meta de la semana ya se cumplió en otros días', () => {
    // El domingo 11 pertenece a la semana anterior: esta semana solo hay 1 de 2 → sigue visible.
    const items = todayItems([semanal], logs('yoga', ['2026-10-11', '2026-10-12']), [], '2026-10-13');
    expect(items).toHaveLength(1);
    expect(items[0].week).toEqual({ count: 1, target: 2 });
    const items2 = todayItems([semanal], logs('yoga', ['2026-10-12', '2026-10-14']), [], '2026-10-13');
    expect(items2).toHaveLength(0);
  });
});

describe('nextValue', () => {
  it('alterna hecho/no hecho en hábitos simples', () => {
    expect(nextValue(habit(), 0)).toBe(1);
    expect(nextValue(habit(), 1)).toBe(0);
  });
  it('los contadores suben hasta la meta y vuelven a cero', () => {
    const agua = habit({ target_per_period: 3 });
    expect([0, 1, 2, 3].map((v) => nextValue(agua, v))).toEqual([1, 2, 3, 0]);
  });
});
