import { z } from 'zod';

import type { HabitInput } from './types';

export const habitSchema = z
  .object({
    name: z.string().trim().min(1, 'Ponle un nombre al hábito.').max(80, 'Máximo 80 caracteres.'),
    category: z.enum(['study', 'reading', 'training', 'sleep', 'water', 'routine', 'health', 'other']),
    frequency: z.enum(['daily', 'weekly']),
    days_of_week: z.array(z.number().int().min(0).max(6)),
    target_per_period: z.number().int().min(1).max(100),
    unit: z
      .string()
      .trim()
      .max(20, 'Máximo 20 caracteres.')
      .transform((v) => (v ? v : null))
      .nullable(),
    reminder_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora no válida.')
      .nullable(),
  })
  .refine((v) => v.frequency === 'weekly' || v.days_of_week.length > 0, {
    path: ['days_of_week'],
    message: 'Elige al menos un día.',
  })
  .refine((v) => v.frequency === 'daily' || v.target_per_period <= 7, {
    path: ['target_per_period'],
    message: 'Una semana tiene 7 días como máximo.',
  });

/** Convierte el formulario en lo que se guarda (días ordenados y sin duplicados). */
export function toHabitInput(v: z.output<typeof habitSchema>): HabitInput {
  return {
    name: v.name,
    category: v.category,
    icon: null,
    color: null,
    frequency: v.frequency,
    days_of_week: v.frequency === 'weekly' ? [0, 1, 2, 3, 4, 5, 6] : [...new Set(v.days_of_week)].sort(),
    target_per_period: v.target_per_period,
    unit: v.frequency === 'daily' && v.target_per_period > 1 ? v.unit : null,
    reminder_time: v.reminder_time,
  };
}
