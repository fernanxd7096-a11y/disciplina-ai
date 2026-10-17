import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';

import { addDays, buildContext, isDayDone, isScheduled, streaks } from '@/features/habits/logic';
import type { Habit, HabitLog } from '@/features/habits/types';
import type { Task } from '@/features/tasks/types';
import { mondayKey } from '@/features/training/logic';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Totales de toda la cuenta (función my_progress_counts en la base). */
export type ProgressCounts = {
  tasks_done: number;
  habit_logs: number;
  workouts: number;
  meals: number;
  meal_days: number;
  weight_logs: number;
  notes: number;
  photo_meals: number;
};

export const EMPTY_COUNTS: ProgressCounts = { tasks_done: 0, habit_logs: 0, workouts: 0, meals: 0, meal_days: 0, weight_logs: 0, notes: 0, photo_meals: 0 };

// ------------------------------------------------------------------ XP y niveles

/**
 * Reglas de experiencia, públicas en la app. Solo suman: un día de descanso o
 * un día sin registrar nunca resta XP.
 */
export const XP_RULES: { key: keyof ProgressCounts; label: string; points: number }[] = [
  { key: 'habit_logs', label: 'Cada hábito cumplido en un día', points: 10 },
  { key: 'tasks_done', label: 'Cada tarea completada', points: 15 },
  { key: 'workouts', label: 'Cada entrenamiento terminado', points: 40 },
  { key: 'meal_days', label: 'Cada día con comidas registradas', points: 5 },
  { key: 'weight_logs', label: 'Cada registro de peso', points: 5 },
];

export function xpFrom(c: ProgressCounts) {
  const breakdown = XP_RULES.map((r) => ({ ...r, count: c[r.key] ?? 0, xp: (c[r.key] ?? 0) * r.points }));
  return { total: breakdown.reduce((a, b) => a + b.xp, 0), breakdown };
}

/** XP acumulada para llegar al nivel n: 100 · n(n−1)/2 (100, 300, 600, 1000…). */
export const xpForLevel = (n: number) => (100 * n * (n - 1)) / 2;

export function levelFor(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return { level, from, to, progress: (xp - from) / (to - from) };
}

// ------------------------------------------------------------------ logros

export type AchievementInput = ProgressCounts & { best_streak: number; level: number };

export type Achievement = {
  code: string;
  title: string;
  description: string;
  icon: IconName;
  metric: keyof AchievementInput;
  target: number;
};

export const ACHIEVEMENTS: Achievement[] = [
  { code: 'first_habit', title: 'Primer paso', description: 'Cumple un hábito por primera vez', icon: 'footsteps-outline', metric: 'habit_logs', target: 1 },
  { code: 'habits_50', title: 'Constancia', description: '50 hábitos cumplidos', icon: 'repeat-outline', metric: 'habit_logs', target: 50 },
  { code: 'habits_200', title: 'Disciplina de hierro', description: '200 hábitos cumplidos', icon: 'shield-checkmark-outline', metric: 'habit_logs', target: 200 },
  { code: 'streak_7', title: 'Semana completa', description: 'Racha de 7 en un hábito', icon: 'flame-outline', metric: 'best_streak', target: 7 },
  { code: 'streak_30', title: 'Mes imparable', description: 'Racha de 30 en un hábito', icon: 'flame', metric: 'best_streak', target: 30 },
  { code: 'first_task', title: 'Manos a la obra', description: 'Completa tu primera tarea', icon: 'checkbox-outline', metric: 'tasks_done', target: 1 },
  { code: 'tasks_25', title: 'Productivo', description: '25 tareas completadas', icon: 'list-outline', metric: 'tasks_done', target: 25 },
  { code: 'tasks_100', title: 'Máquina de pendientes', description: '100 tareas completadas', icon: 'rocket-outline', metric: 'tasks_done', target: 100 },
  { code: 'first_workout', title: 'A entrenar', description: 'Termina tu primer entrenamiento', icon: 'barbell-outline', metric: 'workouts', target: 1 },
  { code: 'workouts_10', title: 'En forma', description: '10 entrenamientos terminados', icon: 'fitness-outline', metric: 'workouts', target: 10 },
  { code: 'workouts_50', title: 'Atleta', description: '50 entrenamientos terminados', icon: 'trophy-outline', metric: 'workouts', target: 50 },
  { code: 'first_meal', title: 'Diario abierto', description: 'Registra tu primera comida', icon: 'restaurant-outline', metric: 'meals', target: 1 },
  { code: 'meal_days_7', title: 'Consciente', description: 'Registra comidas 7 días', icon: 'nutrition-outline', metric: 'meal_days', target: 7 },
  { code: 'meal_days_30', title: 'Hábito nutricional', description: 'Registra comidas 30 días', icon: 'leaf-outline', metric: 'meal_days', target: 30 },
  { code: 'first_photo', title: 'Foto lista', description: 'Registra una comida con foto', icon: 'camera-outline', metric: 'photo_meals', target: 1 },
  { code: 'weight_8', title: 'Seguimiento', description: '8 registros de peso', icon: 'analytics-outline', metric: 'weight_logs', target: 8 },
  { code: 'first_note', title: 'Ideas a salvo', description: 'Escribe tu primera nota', icon: 'document-text-outline', metric: 'notes', target: 1 },
  { code: 'level_5', title: 'Nivel 5', description: 'Alcanza el nivel 5', icon: 'star-outline', metric: 'level', target: 5 },
  { code: 'level_10', title: 'Nivel 10', description: 'Alcanza el nivel 10', icon: 'star', metric: 'level', target: 10 },
];

export function evaluateAchievements(input: AchievementInput) {
  return ACHIEVEMENTS.map((a) => {
    const value = Number(input[a.metric] ?? 0);
    return { ...a, value: Math.min(value, a.target), done: value >= a.target };
  });
}

export function bestStreak(habits: Habit[], logs: HabitLog[], restDays: string[], today: string) {
  return habits.reduce((m, h) => Math.max(m, streaks(h, buildContext(h, logs, restDays), today).best), 0);
}

// ------------------------------------------------------------------ porcentaje de disciplina

export type DisciplineConfig = { habits: boolean; tasks: boolean; training: boolean };
export const DEFAULT_DISCIPLINE: DisciplineConfig = { habits: true, tasks: true, training: true };

export type DisciplinePart = { key: keyof DisciplineConfig; label: string; value: number | null; detail: string; enabled: boolean };

/** Proporción de días programados cumplidos (descansos excluidos; hoy solo cuenta si ya se cumplió). */
export function habitAdherence(habits: Habit[], logs: HabitLog[], restDays: string[], from: string, to: string) {
  const rest = new Set(restDays);
  let total = 0;
  let done = 0;
  for (const h of habits.filter((x) => x.status === 'active' && x.frequency === 'daily')) {
    const ctx = buildContext(h, logs, restDays);
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!isScheduled(h, d) || rest.has(d)) continue;
      const ok = isDayDone(h, ctx.values.get(d));
      if (d === to && !ok) continue;
      total++;
      if (ok) done++;
    }
  }
  return { done, total, rate: total ? done / total : null };
}

/**
 * Disciplina de los últimos 7 días = promedio de los componentes activos que
 * tienen datos. Reglas fijas y visibles; no es una evaluación de personalidad.
 */
export function disciplineScore(args: {
  config: DisciplineConfig;
  habits: Habit[];
  logs: HabitLog[];
  restDays: string[];
  tasks: Pick<Task, 'due_at' | 'status' | 'completed_at'>[];
  workoutsLast7: number;
  daysPerWeek: number | null;
  today: string;
  toLocalDay: (iso: string) => string;
}): { score: number | null; parts: DisciplinePart[] } {
  const from = addDays(args.today, -6);
  const h = habitAdherence(args.habits, args.logs, args.restDays, from, args.today);
  const due = args.tasks.filter((t) => t.due_at && args.toLocalDay(t.due_at) >= from && args.toLocalDay(t.due_at) <= args.today);
  const onTime = due.filter((t) => t.status === 'done' && t.completed_at && t.completed_at <= t.due_at!);
  const trainingRate = args.daysPerWeek ? Math.min(args.workoutsLast7 / args.daysPerWeek, 1) : null;

  const parts: DisciplinePart[] = [
    { key: 'habits', label: 'Hábitos', value: h.rate, detail: h.total ? `${h.done} de ${h.total} días programados cumplidos` : 'Sin hábitos diarios programados', enabled: args.config.habits },
    { key: 'tasks', label: 'Tareas a tiempo', value: due.length ? onTime.length / due.length : null, detail: due.length ? `${onTime.length} de ${due.length} tareas con fecha en estos días` : 'Sin tareas con fecha en estos días', enabled: args.config.tasks },
    {
      key: 'training',
      label: 'Entrenamiento',
      value: trainingRate,
      detail: args.daysPerWeek ? `${args.workoutsLast7} de ${args.daysPerWeek} sesiones planeadas` : 'Sin perfil de entrenamiento',
      enabled: args.config.training,
    },
  ];
  const used = parts.filter((p) => p.enabled && p.value != null);
  return { score: used.length ? Math.round((used.reduce((a, p) => a + p.value!, 0) / used.length) * 100) : null, parts };
}

// ------------------------------------------------------------------ series para gráficas

export function habitDailySeries(habits: Habit[], logs: HabitLog[], restDays: string[], today: string, days: number) {
  return Array.from({ length: days }, (_, i) => addDays(today, i - days + 1)).map((d) => {
    const r = habitAdherence(habits, logs, restDays, d, d);
    return { day: d, rate: r.rate };
  });
}

/** Cuenta por semana (lunes) de una lista de días locales. */
export function weeklyCounts(days: string[], today: string, weeks: number) {
  const start = mondayKey(today);
  return Array.from({ length: weeks }, (_, i) => addDays(start, -7 * (weeks - 1 - i))).map((w) => ({
    week: w,
    count: days.filter((d) => d >= w && d <= addDays(w, 6)).length,
  }));
}

const MINUTE_UNITS = /^(min|mins|minuto|minutos)$/i;
const HOUR_UNITS = /^(h|hr|hrs|hora|horas)$/i;

/** Minutos dedicados por categoría de hábito (solo hábitos medidos en minutos u horas). */
export function minutesByCategory(habits: Habit[], logs: HabitLog[], from: string, to: string) {
  const out = new Map<string, number>();
  for (const h of habits) {
    const unit = (h.unit ?? '').trim();
    const factor = MINUTE_UNITS.test(unit) ? 1 : HOUR_UNITS.test(unit) ? 60 : 0;
    if (!factor) continue;
    const total = logs.filter((l) => l.habit_id === h.id && l.log_date >= from && l.log_date <= to).reduce((a, l) => a + Number(l.value), 0);
    if (total) out.set(h.category ?? 'other', (out.get(h.category ?? 'other') ?? 0) + total * factor);
  }
  return out;
}

/** Variación porcentual frente al periodo anterior (null si no hay base). */
export function change(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}
