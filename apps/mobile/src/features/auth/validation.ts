import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Escribe tu correo.')
  .email('Ese correo no parece válido.');

export const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres.')
  .max(72, 'La contraseña es demasiado larga.')
  .regex(/[A-Za-z]/, 'Incluye al menos una letra.')
  .regex(/[0-9]/, 'Incluye al menos un número.');

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Escribe tu contraseña.'),
});

export const signUpSchema = z
  .object({
    displayName: z.string().trim().max(60, 'Máximo 60 caracteres.').optional(),
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Las contraseñas no coinciden.' });

export const resetSchema = z.object({ email: emailSchema });

export { validate, type FieldErrors } from '@/lib/validation';

/** Traduce los errores de Supabase Auth a mensajes claros en español. */
export function authErrorMessage(error: { message?: string; code?: string; status?: number } | null | undefined): string {
  if (!error) return 'Ocurrió un error inesperado.';
  const code = error.code ?? '';
  const msg = (error.message ?? '').toLowerCase();
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.';
  }
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return 'Confirma tu correo: revisa el enlace que te enviamos.';
  }
  if (code === 'user_already_exists' || msg.includes('already registered')) {
    return 'Ya existe una cuenta con ese correo.';
  }
  if (code === 'weak_password' || msg.includes('weak password')) {
    return 'Esa contraseña es muy débil. Usa una más larga y variada.';
  }
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || error.status === 429) {
    return 'Demasiados intentos. Espera unos minutos y vuelve a intentar.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Sin conexión con el servidor. Revisa tu internet.';
  }
  return 'No se pudo completar la operación. Intenta de nuevo.';
}
