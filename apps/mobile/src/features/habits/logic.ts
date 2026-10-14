/**
 * Reglas de hábitos (funciones puras, sin red ni fechas implícitas).
 * Todas las fechas son claves de día local "AAAA-MM-DD" ya calculadas en la
 * zona horaria del usuario, así no hay errores de medianoche/UTC.
 *
 * Reglas transparentes:
 *  - Diario: el día cuenta si está en days_of_week y el valor registrado ≥ meta.
 *  - Semanal: la semana (lunes a domingo) se cumple con ≥ meta días registrados.
 *  - Los días de descanso y los días no programados NO rompen la racha.
 *  - Hoy sin completar todavía no rompe la racha (el día no ha terminado).
 */
import type { Habit, HabitLog } from './types';

type DayKey = string;

const MS_DAY = 86_400_000;

function toUtc(key: DayKey): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): DayKey {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(key: DayKey, n: number): DayKey {
  return fromUtc(toUtc(key) + n * MS_DAY);
}

/** 0 = domingo … 6 = sábado. */
export function dayOfWeek(key: DayKey): number {
  return new Date(toUtc(key)).getUTCDay();
}

/** Lunes de la semana (ISO) que contiene ese día. */
export function weekStart(key: DayKey): DayKey {
  const dow = dayOfWeek(key);
  return addDays(key, -((dow + 6) % 7));
}

export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((toUtc(to) - toUtc(from)) / MS_DAY);
}

type Ctx = {
  /** Valor registrado por día para este hábito. */
  values: Map<DayKey, number>;
  restDays: Set<DayKey>;
};

export function buildContext(habit: Pick<Habit, 'id'>, logs: HabitLog[], restDays: Iterable<DayKey>): Ctx {
  const values = new Map<DayKey, number>();
  for (const l of logs) if (l.habit_id === habit.id) values.set(l.log_date, Number(l.value));
  return { values, restDays: new Set(restDays) };
}

/** ¿Este hábito se espera en ese día? (los semanales se pueden hacer cualquier día) */
export function isScheduled(habit: Pick<Habit, 'frequency' | 'days_of_week' | 'start_date'>, key: DayKey): boolean {
  if (key < habit.start_date) return false;
  if (habit.frequency === 'weekly') return true;
  return habit.days_of_week.includes(dayOfWeek(key));
}

/** ¿El valor de ese día alcanza la meta? Para semanales, cualquier registro > 0 suma un día. */
export function isDayDone(habit: Pick<Habit, 'frequency' | 'target_per_period'>, value: number | undefined): boolean {
  if (!value || value <= 0) return false;
  return habit.frequency === 'weekly' ? true : value >= habit.target_per_period;
}

/** Días cumplidos en la semana que contiene `key` (para hábitos semanales). */
export function weekCount(habit: Pick<Habit, 'frequency' | 'target_per_period'>, ctx: Ctx, key: DayKey): number {
  const start = weekStart(key);
  let n = 0;
  for (let i = 0; i < 7; i++) if (isDayDone(habit, ctx.values.get(addDays(start, i)))) n++;
  return n;
}

export type Streak = { current: number; best: number; unit: 'días' | 'semanas' };

/** Racha actual y mejor racha. Diarios en días; semanales en semanas. */
export function streaks(habit: Habit, ctx: Ctx, today: DayKey): Streak {
  if (habit.frequency === 'weekly') return weeklyStreaks(habit, ctx, today);

  const start = habit.start_date;
  if (today < start) return { current: 0, best: 0, unit: 'días' };

  // Recorre de start → today calculando rachas; los días neutrales no cortan.
  let run = 0;
  let best = 0;
  let current = 0;
  const total = daysBetween(start, today);
  for (let i = 0; i <= total; i++) {
    const day = addDays(start, i);
    if (!isScheduled(habit, day) || ctx.restDays.has(day)) continue; // neutral
    if (isDayDone(habit, ctx.values.get(day))) {
      run++;
      best = Math.max(best, run);
    } else if (day !== today) {
      run = 0; // hoy pendiente no corta
    }
  }
  current = run;
  return { current, best, unit: 'días' };
}

function weeklyStreaks(habit: Habit, ctx: Ctx, today: DayKey): Streak {
  const first = weekStart(habit.start_date);
  const thisWeek = weekStart(today);
  let run = 0;
  let best = 0;
  for (let w = first; w <= thisWeek; w = addDays(w, 7)) {
    const met = weekCount(habit, ctx, w) >= habit.target_per_period;
    if (met) {
      run++;
      best = Math.max(best, run);
    } else if (w !== thisWeek) {
      run = 0; // la semana en curso aún puede cumplirse
    }
  }
  return { current: run, best, unit: 'semanas' };
}

/**
 * Porcentaje de cumplimiento de los últimos `days` días (sin contar hoy si está pendiente).
 * Diarios: días cumplidos / días programados. Semanales: semanas cumplidas / semanas completas.
 * Devuelve null si todavía no hay días evaluables (no inventa un 0 %).
 */
export function completionRate(habit: Habit, ctx: Ctx, today: DayKey, days = 30): number | null {
  if (habit.frequency === 'weekly') {
    const weeks = Math.max(1, Math.floor(days / 7));
    let evaluated = 0;
    let met = 0;
    for (let i = 1; i <= weeks; i++) {
      const w = addDays(weekStart(today), -7 * i);
      if (addDays(w, 6) < habit.start_date) continue;
      evaluated++;
      if (weekCount(habit, ctx, w) >= habit.target_per_period) met++;
    }
    return evaluated ? met / evaluated : null;
  }
  let evaluated = 0;
  let done = 0;
  for (let i = 0; i < days; i++) {
    const day = addDays(today, -i);
    if (!isScheduled(habit, day) || ctx.restDays.has(day)) continue;
    const ok = isDayDone(habit, ctx.values.get(day));
    if (day === today && !ok) continue;
    evaluated++;
    if (ok) done++;
  }
  return evaluated ? done / evaluated : null;
}

export type TodayItem = {
  habit: Habit;
  value: number;
  done: boolean;
  /** Solo semanales: progreso de la semana. */
  week?: { count: number; target: number };
};

/**
 * Hábitos activos que tocan hoy, con su estado. Los semanales aparecen
 * mientras la meta de la semana no esté cumplida, o si ya se marcaron hoy.
 */
export function todayItems(habits: Habit[], logs: HabitLog[], restDays: Iterable<DayKey>, today: DayKey): TodayItem[] {
  const rest = new Set(restDays);
  const items: TodayItem[] = [];
  for (const habit of habits) {
    if (habit.status !== 'active' || habit.deleted_at) continue;
    if (!isScheduled(habit, today)) continue;
    const ctx: Ctx = buildContext(habit, logs, rest);
    const value = ctx.values.get(today) ?? 0;
    const done = isDayDone(habit, value);
    if (habit.frequency === 'weekly') {
      const count = weekCount(habit, ctx, today);
      if (count >= habit.target_per_period && !done) continue;
      items.push({ habit, value, done, week: { count, target: habit.target_per_period } });
    } else {
      items.push({ habit, value, done });
    }
  }
  return items.sort((a, b) => Number(a.done) - Number(b.done) || a.habit.sort_order - b.habit.sort_order);
}

/** Resumen del día para el inicio. total = 0 significa "nada programado hoy". */
export function todaySummary(items: TodayItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length };
}

/** Siguiente valor al tocar el botón de un hábito (contadores suben hasta la meta y vuelven a 0). */
export function nextValue(habit: Pick<Habit, 'frequency' | 'target_per_period'>, current: number): number {
  if (habit.frequency === 'weekly' || habit.target_per_period <= 1) return current > 0 ? 0 : 1;
  return current >= habit.target_per_period ? 0 : current + 1;
}
