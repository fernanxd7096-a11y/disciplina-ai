import type { Equipment, Experience, Goal, MuscleGroup } from './types';

export const goalLabels: Record<Goal, string> = {
  lose_fat: 'Perder grasa',
  gain_muscle: 'Ganar músculo',
  strength: 'Ganar fuerza',
  endurance: 'Mejorar resistencia',
  general: 'Mantenerme en forma',
};

export const experienceLabels: Record<Experience, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
};

export const equipmentLabels: Record<Equipment, string> = {
  bodyweight: 'Peso corporal',
  pullup_bar: 'Barra de dominadas',
  dip_bars: 'Paralelas',
  dumbbells: 'Mancuernas',
  barbell: 'Barra y discos',
  kettlebell: 'Pesa rusa',
  bands: 'Ligas',
  bench: 'Banco',
  machines: 'Máquinas de gimnasio',
  punching_bag: 'Saco de box',
  jump_rope: 'Cuerda',
};

export const muscleLabels: Record<MuscleGroup, string> = {
  chest: 'Pecho',
  back: 'Espalda',
  shoulders: 'Hombros',
  arms: 'Brazos',
  legs: 'Piernas',
  glutes: 'Glúteos',
  core: 'Abdomen',
  full_body: 'Cuerpo completo',
  cardio: 'Cardio',
};

/**
 * Ejercicios que se miden en segundos por serie (isométricos y cardio por
 * tiempo). En la base, "reps" guarda los segundos.
 */
export const TIMED_CODES = new Set(['plank', 'side_plank', 'hollow_hold', 'dead_hang', 'jump_rope', 'shadow_boxing', 'heavy_bag_rounds', 'mountain_climber', 'jumping_jack']);

export const isTimed = (e: { code: string | null }) => !!e.code && TIMED_CODES.has(e.code);

export const repsUnit = (e: { code: string | null }) => (isTimed(e) ? 's' : 'reps');

/** Calentamiento general (antes de cada sesión). */
export const WARMUP = [
  '2–3 min de movilidad: círculos de cuello, hombros, cadera y tobillos.',
  '2 min de cardio suave: trote en el sitio o saltos sin impacto.',
  '1–2 series de aproximación del primer ejercicio, con poca carga.',
];

/** Vuelta a la calma (al terminar). */
export const COOLDOWN = [
  '3–5 min caminando o respirando lento para bajar pulsaciones.',
  'Estiramientos suaves de 20–30 s: pecho, espalda, cuádriceps, isquiotibiales y gemelos.',
];

export const SAFETY_NOTE =
  'Detente si sientes dolor agudo, mareo o falta de aire anormal. Ante lesiones o problemas de salud, consulta a un profesional antes de entrenar.';

export const equipmentOptions = Object.keys(equipmentLabels).filter((e) => e !== 'bodyweight') as Equipment[];
