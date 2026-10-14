import type { z } from 'zod';

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

/** Valida y devuelve el primer error por campo, listo para mostrar. */
export function validate<T>(schema: z.ZodType<T>, values: unknown): { data?: T; errors: FieldErrors<T> } {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data, errors: {} };
  const errors: FieldErrors<T> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof T | undefined;
    if (field !== undefined && !errors[field]) errors[field] = issue.message;
  }
  return { errors };
}
