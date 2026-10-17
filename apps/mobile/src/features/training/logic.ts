import { isTimed } from './constants';
import type { Equipment, Exercise, Experience, FitnessProfileInput, Goal, MuscleGroup, PlanDraft, PlanExercise, SetLog, WorkoutSession } from './types';

// ------------------------------------------------------------------ generador de rutinas (sin IA)

type DayType = 'full' | 'push' | 'pull' | 'legs' | 'upper' | 'lower';

const DAY_NAMES: Record<DayType, string> = {
  full: 'Cuerpo completo',
  push: 'Empuje',
  pull: 'Tirón',
  legs: 'Piernas',
  upper: 'Torso',
  lower: 'Pierna y core',
};

/** Grupos musculares por día, en orden de prioridad (los últimos se recortan si falta tiempo). */
const SLOTS: Record<DayType, MuscleGroup[]> = {
  full: ['legs', 'chest', 'back', 'glutes', 'shoulders', 'core'],
  push: ['chest', 'shoulders', 'chest', 'arms', 'core'],
  pull: ['back', 'back', 'arms', 'shoulders', 'core'],
  legs: ['legs', 'glutes', 'legs', 'legs', 'core'],
  upper: ['chest', 'back', 'shoulders', 'back', 'arms'],
  lower: ['legs', 'glutes', 'legs', 'core', 'core'],
};

export function splitFor(days: number, experience: Experience): DayType[] {
  if (days <= 2) return Array(days).fill('full');
  if (days === 3) return experience === 'beginner' ? ['full', 'full', 'full'] : ['push', 'pull', 'legs'];
  if (days === 4) return ['upper', 'lower', 'upper', 'lower'];
  if (days === 5) return ['push', 'pull', 'legs', 'upper', 'lower'];
  return ['push', 'pull', 'legs', 'push', 'pull', 'legs'];
}

export type Prescription = { sets: number; reps_min: number; reps_max: number; rest_seconds: number };

export function prescription(goal: Goal, experience: Experience, timed: boolean): Prescription {
  const sets = experience === 'beginner' ? 3 : goal === 'strength' || experience === 'advanced' ? 4 : 3;
  if (timed) return { sets, reps_min: experience === 'beginner' ? 20 : 30, reps_max: experience === 'beginner' ? 30 : 45, rest_seconds: 60 };
  switch (goal) {
    case 'strength':
      return { sets, reps_min: 4, reps_max: 6, rest_seconds: 150 };
    case 'gain_muscle':
      return { sets, reps_min: 8, reps_max: 12, rest_seconds: 90 };
    case 'lose_fat':
      return { sets, reps_min: 10, reps_max: 15, rest_seconds: 60 };
    case 'endurance':
      return { sets, reps_min: 12, reps_max: 20, rest_seconds: 45 };
    default:
      return { sets, reps_min: 8, reps_max: 12, rest_seconds: 75 };
  }
}

const LEVEL_RANK: Record<Experience, number> = { beginner: 0, intermediate: 1, advanced: 2 };

export function allowedEquipment(profile: Pick<FitnessProfileInput, 'equipment'>): Set<Equipment> {
  return new Set<Equipment>(['bodyweight', ...profile.equipment]);
}

/** Minutos estimados de un día: ~40 s por serie + descanso, más 10 min de calentamiento y vuelta a la calma. */
export function estimateMinutes(items: Pick<PlanExercise, 'sets' | 'rest_seconds'>[]) {
  return 10 + items.reduce((a, i) => a + (i.sets * (40 + i.rest_seconds)) / 60, 0);
}

/**
 * Rutina base determinista a partir del perfil y del catálogo. Funciona sin
 * conexión a la IA; la IA (opcional) puede personalizarla más.
 */
export function generatePlan(profile: FitnessProfileInput, catalog: Exercise[]): PlanDraft {
  const equip = allowedEquipment(profile);
  const maxLevel = LEVEL_RANK[profile.experience];
  const pool = catalog.filter((e) => equip.has(e.equipment) && LEVEL_RANK[e.level] <= maxLevel);
  const split = splitFor(profile.days_per_week, profile.experience);
  const addCardio = profile.goal === 'lose_fat' || profile.goal === 'endurance';
  const items: PlanDraft['items'] = [];
  const usedOfType = new Map<DayType, number>();

  split.forEach((type, dayIndex) => {
    const rotation = usedOfType.get(type) ?? 0;
    usedOfType.set(type, rotation + 1);
    const slots = addCardio ? [...SLOTS[type].slice(0, -1), 'cardio' as MuscleGroup, SLOTS[type].at(-1)!] : SLOTS[type];
    const used = new Set<string>();
    const day: PlanDraft['items'] = [];
    slots.forEach((muscle, slotIdx) => {
      const options = pool
        .filter((e) => e.muscle_group === muscle && !used.has(e.id))
        // Prefiere el nivel del usuario y, luego, el equipamiento no corporal (más progresable).
        .sort(
          (a, b) =>
            Math.abs(LEVEL_RANK[a.level] - maxLevel) - Math.abs(LEVEL_RANK[b.level] - maxLevel) ||
            Number(a.equipment === 'bodyweight') - Number(b.equipment === 'bodyweight') ||
            a.name_es.localeCompare(b.name_es),
        );
      if (!options.length) return;
      const pick = options[(rotation + slotIdx) % options.length];
      used.add(pick.id);
      day.push({ day_index: dayIndex, exercise_id: pick.id, ...prescription(profile.goal, profile.experience, isTimed(pick)), suggested_kg: null, sort_order: day.length });
    });
    while (day.length > 2 && estimateMinutes(day) > profile.minutes_per_session) day.pop();
    items.push(...day);
  });

  const labels = split.map((t, i) => {
    const sameBefore = split.slice(0, i).filter((x) => x === t).length;
    const repeats = split.filter((x) => x === t).length > 1;
    return repeats ? `${DAY_NAMES[t]} ${String.fromCharCode(65 + sameBefore)}` : DAY_NAMES[t];
  });

  return {
    name: `Rutina ${profile.days_per_week} día${profile.days_per_week > 1 ? 's' : ''} por semana`,
    source: 'manual',
    notes: 'Rutina base generada con reglas fijas según tu objetivo, experiencia, tiempo y equipo. Sube la carga o las repeticiones cuando completes todas las series con buena técnica.',
    safety_notes: profile.limitations ? ['Revisa que ningún ejercicio choque con las limitaciones que indicaste; cámbialo por una alternativa si es así.'] : [],
    day_labels: labels,
    items,
  };
}

// ------------------------------------------------------------------ alternativas y progresión

export function alternativesFor(ex: Exercise, catalog: Exercise[], equipment: Set<Equipment>) {
  const same = catalog.filter((e) => e.id !== ex.id && e.muscle_group === ex.muscle_group && equipment.has(e.equipment));
  const r = LEVEL_RANK[ex.level];
  return {
    easier: same.filter((e) => LEVEL_RANK[e.level] < r),
    similar: same.filter((e) => LEVEL_RANK[e.level] === r),
    harder: same.filter((e) => LEVEL_RANK[e.level] > r),
  };
}

export type Suggestion = { weight_kg: number | null; reps: number; reason: string };

/**
 * Doble progresión: con el mismo peso sube repeticiones hasta el máximo del
 * rango en todas las series; entonces sube la carga y vuelve al mínimo.
 */
export function suggestNext(pe: Pick<PlanExercise, 'sets' | 'reps_min' | 'reps_max' | 'suggested_kg'>, ex: Pick<Exercise, 'equipment' | 'code'>, lastSets: Pick<SetLog, 'reps' | 'weight_kg'>[]): Suggestion {
  const bodyweight = ex.equipment === 'bodyweight' || ex.equipment === 'pullup_bar' || ex.equipment === 'dip_bars';
  if (!lastSets.length) {
    return {
      weight_kg: bodyweight ? null : pe.suggested_kg,
      reps: pe.reps_min,
      reason: bodyweight || pe.suggested_kg == null ? 'Primera vez: elige una carga con la que hagas todas las repeticiones con buena técnica.' : 'Peso sugerido por tu rutina.',
    };
  }
  const weight = Math.max(...lastSets.map((s) => Number(s.weight_kg)));
  const atWeight = lastSets.filter((s) => Number(s.weight_kg) === weight);
  const allTop = atWeight.length >= pe.sets && atWeight.every((s) => s.reps >= pe.reps_max);
  const unit = isTimed(ex) ? 's' : 'repeticiones';
  if (!allTop) {
    return { weight_kg: weight > 0 ? weight : null, reps: pe.reps_max, reason: `Mantén la carga hasta lograr ${pe.reps_max} ${unit} en las ${pe.sets} series.` };
  }
  if (bodyweight && weight === 0) {
    return { weight_kg: null, reps: pe.reps_max, reason: 'Completaste el rango: prueba una variante más difícil o añade lastre.' };
  }
  const step = weight >= 20 ? 2.5 : 1;
  return { weight_kg: Math.round((weight + step) * 2) / 2, reps: pe.reps_min, reason: `Completaste todas las series: sube a ${Math.round((weight + step) * 2) / 2} kg y vuelve a ${pe.reps_min} ${unit}.` };
}

// ------------------------------------------------------------------ calendario de la rutina

/** Siguiente día de la rutina: el que sigue al último entrenamiento terminado con este plan. */
export function nextDayIndex(dayCount: number, planId: string, sessions: Pick<WorkoutSession, 'plan_id' | 'day_index' | 'finished_at' | 'started_at'>[]) {
  const last = sessions
    .filter((s) => s.plan_id === planId && s.finished_at && s.day_index != null)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  return last ? ((last.day_index as number) + 1) % dayCount : 0;
}

/** Inicio (lunes) de la semana de una fecha local AAAA-MM-DD. */
export function mondayKey(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function sessionsThisWeek(sessions: Pick<WorkoutSession, 'finished_at' | 'started_at'>[], today: string, toLocalDay: (iso: string) => string) {
  const monday = mondayKey(today);
  return sessions.filter((s) => s.finished_at && toLocalDay(s.started_at) >= monday && toLocalDay(s.started_at) <= today).length;
}

// ------------------------------------------------------------------ progreso

/** 1RM estimado (fórmula de Epley). Solo es fiable hasta ~12 repeticiones. */
export function estimated1RM(weight: number, reps: number) {
  if (weight <= 0 || reps <= 0) return 0;
  return Math.round(weight * (1 + Math.min(reps, 12) / 30) * 10) / 10;
}

export type ProgressPoint = { date: string; value: number };

/**
 * Evolución por sesión de un ejercicio: 1RM estimado con carga, o mejor
 * número de repeticiones / segundos con peso corporal.
 */
export function exerciseProgress(
  sessions: Pick<WorkoutSession, 'id' | 'started_at' | 'finished_at'>[],
  sets: Pick<SetLog, 'session_id' | 'exercise_id' | 'reps' | 'weight_kg'>[],
  exerciseId: string,
  toLocalDay: (iso: string) => string,
): { metric: 'e1rm' | 'reps'; points: ProgressPoint[] } {
  const mine = sets.filter((s) => s.exercise_id === exerciseId);
  const weighted = mine.some((s) => Number(s.weight_kg) > 0);
  const points: ProgressPoint[] = [];
  for (const sess of [...sessions].filter((s) => s.finished_at).sort((a, b) => a.started_at.localeCompare(b.started_at))) {
    const inSession = mine.filter((s) => s.session_id === sess.id);
    if (!inSession.length) continue;
    const value = weighted ? Math.max(...inSession.map((s) => estimated1RM(Number(s.weight_kg), s.reps))) : Math.max(...inSession.map((s) => s.reps));
    points.push({ date: toLocalDay(sess.started_at), value });
  }
  return { metric: weighted ? 'e1rm' : 'reps', points };
}

/** Volumen total (kg × repeticiones) de una sesión. */
export function sessionVolume(sets: Pick<SetLog, 'reps' | 'weight_kg'>[]) {
  return Math.round(sets.reduce((a, s) => a + s.reps * Number(s.weight_kg), 0));
}
