import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import type { HabitCategory, HabitInput } from './types';

type IconName = ComponentProps<typeof Ionicons>['name'];

export const categoryMeta: Record<HabitCategory, { label: string; icon: IconName; color: string }> = {
  study: { label: 'Estudio', icon: 'school-outline', color: '#22D3EE' },
  reading: { label: 'Lectura', icon: 'book-outline', color: '#818CF8' },
  training: { label: 'Entreno', icon: 'barbell-outline', color: '#F472B6' },
  sleep: { label: 'Sueño', icon: 'moon-outline', color: '#A78BFA' },
  water: { label: 'Agua', icon: 'water-outline', color: '#38BDF8' },
  routine: { label: 'Rutina', icon: 'sunny-outline', color: '#FBBF24' },
  health: { label: 'Salud', icon: 'heart-outline', color: '#34D399' },
  other: { label: 'Otro', icon: 'sparkles-outline', color: '#94A3B8' },
};

export const categories = Object.keys(categoryMeta) as HabitCategory[];

/** Plantillas de la especificación: estudiar, leer, entrenar, dormir, agua, rutina. */
export const habitPresets: (HabitInput & { key: string })[] = [
  { key: 'study', name: 'Estudiar 1 hora', category: 'study', icon: null, color: null, frequency: 'daily', days_of_week: [1, 2, 3, 4, 5], target_per_period: 1, unit: null, reminder_time: null },
  { key: 'reading', name: 'Leer 20 minutos', category: 'reading', icon: null, color: null, frequency: 'daily', days_of_week: [0, 1, 2, 3, 4, 5, 6], target_per_period: 1, unit: null, reminder_time: null },
  { key: 'training', name: 'Entrenar', category: 'training', icon: null, color: null, frequency: 'weekly', days_of_week: [0, 1, 2, 3, 4, 5, 6], target_per_period: 3, unit: null, reminder_time: null },
  { key: 'sleep', name: 'Dormir antes de las 11 p. m.', category: 'sleep', icon: null, color: null, frequency: 'daily', days_of_week: [0, 1, 2, 3, 4, 5, 6], target_per_period: 1, unit: null, reminder_time: null },
  { key: 'water', name: 'Beber agua', category: 'water', icon: null, color: null, frequency: 'daily', days_of_week: [0, 1, 2, 3, 4, 5, 6], target_per_period: 8, unit: 'vasos', reminder_time: null },
  { key: 'routine', name: 'Rutina de mañana', category: 'routine', icon: null, color: null, frequency: 'daily', days_of_week: [1, 2, 3, 4, 5], target_per_period: 1, unit: null, reminder_time: null },
];

/** Etiquetas cortas lun→dom (orden de lectura en Perú) con su número 0–6. */
export const weekDays: { value: number; short: string; long: string }[] = [
  { value: 1, short: 'L', long: 'lunes' },
  { value: 2, short: 'M', long: 'martes' },
  { value: 3, short: 'X', long: 'miércoles' },
  { value: 4, short: 'J', long: 'jueves' },
  { value: 5, short: 'V', long: 'viernes' },
  { value: 6, short: 'S', long: 'sábado' },
  { value: 0, short: 'D', long: 'domingo' },
];

/** "Todos los días", "Lun a vie", "3 veces por semana", "L, X, V". */
export function scheduleLabel(h: Pick<HabitInput, 'frequency' | 'days_of_week' | 'target_per_period'>): string {
  if (h.frequency === 'weekly') {
    return h.target_per_period === 1 ? '1 vez por semana' : `${h.target_per_period} veces por semana`;
  }
  const set = new Set(h.days_of_week);
  if (set.size === 7) return 'Todos los días';
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'De lunes a viernes';
  if (set.size === 2 && set.has(0) && set.has(6)) return 'Fines de semana';
  return weekDays.filter((d) => set.has(d.value)).map((d) => d.short).join(', ');
}
