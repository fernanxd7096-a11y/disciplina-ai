export type Goal = 'lose_fat' | 'gain_muscle' | 'strength' | 'endurance' | 'general';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type Equipment =
  | 'bodyweight'
  | 'pullup_bar'
  | 'dip_bars'
  | 'dumbbells'
  | 'barbell'
  | 'kettlebell'
  | 'bands'
  | 'bench'
  | 'machines'
  | 'punching_bag'
  | 'jump_rope';
export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'glutes' | 'core' | 'full_body' | 'cardio';

export type FitnessProfile = {
  user_id: string;
  goal: Goal;
  experience: Experience;
  days_per_week: number;
  minutes_per_session: number;
  equipment: Equipment[];
  limitations: string | null;
};

export type FitnessProfileInput = Omit<FitnessProfile, 'user_id'>;

export type Exercise = {
  id: string;
  owner_id: string | null;
  code: string | null;
  name_es: string;
  muscle_group: MuscleGroup;
  equipment: Equipment;
  level: Experience;
  instructions: string;
  common_mistakes: string;
};

export type WorkoutPlan = {
  id: string;
  user_id: string;
  name: string;
  source: 'manual' | 'ai';
  day_labels: string[];
  notes: string | null;
  active: boolean;
  created_at: string;
};

export type PlanExercise = {
  id: string;
  plan_id: string;
  day_index: number;
  exercise_id: string;
  sets: number;
  reps_min: number;
  reps_max: number;
  rest_seconds: number;
  suggested_kg: number | null;
  sort_order: number;
};

/** Rutina aún no guardada (generada en la app o propuesta por la IA). */
export type PlanDraft = {
  name: string;
  source: 'manual' | 'ai';
  notes: string;
  safety_notes: string[];
  day_labels: string[];
  items: Omit<PlanExercise, 'id' | 'plan_id'>[];
};

export type WorkoutSession = {
  id: string;
  user_id: string;
  plan_id: string | null;
  day_index: number | null;
  title: string;
  started_at: string;
  finished_at: string | null;
  perceived_effort: number | null;
  notes: string | null;
};

export type SetLog = {
  id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  reps: number;
  weight_kg: number;
  created_at: string;
};
