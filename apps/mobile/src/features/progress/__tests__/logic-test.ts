import type { Habit, HabitLog } from '@/features/habits/types';
import { change, disciplineScore, evaluateAchievements, EMPTY_COUNTS, habitAdherence, levelFor, minutesByCategory, weeklyCounts, xpFrom, xpForLevel } from '../logic';

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 'h1', user_id: 'u', name: 'Leer', icon: null, color: null, category: 'reading', frequency: 'daily', days_of_week: [0, 1, 2, 3, 4, 5, 6], target_per_period: 1, unit: null,
  reminder_time: null, status: 'active', start_date: '2026-01-01', sort_order: 0, created_at: '', updated_at: '', deleted_at: null, ...over,
} as Habit);
const log = (habit_id: string, log_date: string, value = 1): HabitLog => ({ id: `${habit_id}-${log_date}`, user_id: 'u', habit_id, log_date, value, note: null } as HabitLog);
const today = '2026-10-16';
const id = (iso: string) => iso.slice(0, 10);

describe('XP y niveles', () => {
  it('suma con reglas públicas', () => {
    const x = xpFrom({ ...EMPTY_COUNTS, habit_logs: 10, tasks_done: 2, workouts: 1, meal_days: 3, weight_logs: 1 });
    expect(x.total).toBe(100 + 30 + 40 + 15 + 5);
  });
  it('niveles: 100, 300, 600… XP', () => {
    expect([xpForLevel(1), xpForLevel(2), xpForLevel(3), xpForLevel(4)]).toEqual([0, 100, 300, 600]);
    expect(levelFor(0).level).toBe(1);
    expect(levelFor(99).level).toBe(1);
    expect(levelFor(100).level).toBe(2);
    expect(levelFor(450)).toMatchObject({ level: 3, from: 300, to: 600, progress: 0.5 });
  });
  it('logros con progreso', () => {
    const a = evaluateAchievements({ ...EMPTY_COUNTS, workouts: 3, best_streak: 7, level: 2 });
    expect(a.find((x) => x.code === 'first_workout')?.done).toBe(true);
    expect(a.find((x) => x.code === 'workouts_10')).toMatchObject({ done: false, value: 3, target: 10 });
    expect(a.find((x) => x.code === 'streak_7')?.done).toBe(true);
    expect(new Set(a.map((x) => x.code)).size).toBe(a.length);
  });
});

describe('disciplina', () => {
  it('los días de descanso no cuentan en contra y hoy solo cuenta si ya se cumplió', () => {
    const h = habit();
    const logs = [log('h1', '2026-10-10'), log('h1', '2026-10-11'), log('h1', '2026-10-13')];
    const r = habitAdherence([h], logs, ['2026-10-12'], '2026-10-10', today);
    // 10,11,13,14,15 evaluados (12 descanso, 16 hoy sin cumplir) → 3/5
    expect(r).toEqual({ done: 3, total: 5, rate: 0.6 });
  });

  it('promedia solo los componentes activos con datos', () => {
    const base = {
      config: { habits: true, tasks: true, training: true },
      habits: [habit()],
      logs: ['10', '11', '12', '13', '14', '15', '16'].map((d) => log('h1', `2026-10-${d}`)),
      restDays: [],
      tasks: [
        { due_at: '2026-10-14T23:00:00Z', status: 'done' as const, completed_at: '2026-10-14T20:00:00Z' },
        { due_at: '2026-10-15T23:00:00Z', status: 'todo' as const, completed_at: null },
      ],
      workoutsLast7: 1,
      daysPerWeek: 4,
      today,
      toLocalDay: id,
    };
    const all = disciplineScore(base);
    expect(all.parts.map((p) => p.value)).toEqual([1, 0.5, 0.25]);
    expect(all.score).toBe(58);
    expect(disciplineScore({ ...base, config: { habits: true, tasks: false, training: false } }).score).toBe(100);
    expect(disciplineScore({ ...base, habits: [], tasks: [], daysPerWeek: null }).score).toBeNull();
  });
});

describe('series', () => {
  it('cuenta por semana desde el lunes', () => {
    expect(weeklyCounts(['2026-10-12', '2026-10-16', '2026-10-05', '2026-09-01'], today, 3)).toEqual([
      { week: '2026-09-28', count: 0 },
      { week: '2026-10-05', count: 1 },
      { week: '2026-10-12', count: 2 },
    ]);
  });
  it('minutos dedicados solo de hábitos medidos en minutos u horas', () => {
    const study = habit({ id: 's', category: 'study', unit: 'minutos', target_per_period: 60 });
    const read = habit({ id: 'r', category: 'reading', unit: 'h', target_per_period: 2 });
    const water = habit({ id: 'w', category: 'water', unit: 'vasos', target_per_period: 8 });
    const m = minutesByCategory([study, read, water], [log('s', '2026-10-15', 45), log('s', '2026-10-16', 30), log('r', '2026-10-16', 1.5), log('w', '2026-10-16', 8)], '2026-10-10', today);
    expect(Object.fromEntries(m)).toEqual({ study: 75, reading: 90 });
  });
  it('variación frente al periodo anterior', () => {
    expect(change(12, 10)).toBe(20);
    expect(change(5, 0)).toBeNull();
  });
});
