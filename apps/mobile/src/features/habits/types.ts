export type HabitFrequency = 'daily' | 'weekly';
export type HabitStatus = 'active' | 'paused' | 'archived';
export type HabitCategory = 'study' | 'reading' | 'training' | 'sleep' | 'water' | 'routine' | 'health' | 'other';

export type Habit = {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  category: HabitCategory | null;
  frequency: HabitFrequency;
  /** 0 = domingo … 6 = sábado. Solo aplica a frecuencia diaria. */
  days_of_week: number[];
  /** Diaria: cantidad por día (p. ej. 8 vasos). Semanal: veces por semana. */
  target_per_period: number;
  unit: string | null;
  reminder_time: string | null;
  status: HabitStatus;
  start_date: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type HabitLog = {
  id: string;
  user_id: string;
  habit_id: string;
  /** Día local AAAA-MM-DD en la zona del perfil. */
  log_date: string;
  value: number;
  note: string | null;
};

export type RestDay = { id: string; user_id: string; date: string; reason: string | null };

export type HabitInput = Pick<
  Habit,
  'name' | 'icon' | 'color' | 'category' | 'frequency' | 'days_of_week' | 'target_per_period' | 'unit' | 'reminder_time'
>;
