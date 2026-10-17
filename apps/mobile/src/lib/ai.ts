import type { SupabaseClient } from '@supabase/supabase-js';

/** Error de una función de IA con un código estable y un mensaje para mostrar. */
export class AIError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  ai_not_configured: 'La IA todavía no está configurada en el servidor. Mientras tanto puedes usar el registro manual.',
  quota_exceeded: 'Alcanzaste el límite diario de uso de IA. Se reinicia mañana.',
  ai_rate_limited: 'El servicio de IA está saturado. Intenta en unos minutos.',
  ai_timeout: 'La IA tardó demasiado. Intenta de nuevo.',
  ai_blocked: 'La IA no pudo procesar este contenido.',
  ai_misconfigured: 'El servicio de IA no está bien configurado en el servidor.',
  unauthorized: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  missing_profile: 'Completa tu perfil de entrenamiento primero.',
  network: 'Sin conexión con el servidor. Revisa tu internet.',
};

async function readError(error: unknown): Promise<{ code: string; message?: string }> {
  const ctx = (error as { context?: unknown })?.context;
  // supabase-js entrega la Response original en error.context.
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      const body = (await (ctx as Response).clone().json()) as { error?: { code?: string; message?: string } };
      if (body?.error?.code) return { code: body.error.code, message: body.error.message };
    } catch {
      // cuerpo no JSON
    }
    const status = (ctx as Response).status;
    if (status === 401) return { code: 'unauthorized' };
    if (status === 404) return { code: 'ai_not_configured', message: 'La función de IA aún no está desplegada en el servidor.' };
  }
  const body = (error as { body?: { error?: { code?: string; message?: string } } })?.body;
  if (body?.error?.code) return { code: body.error.code, message: body.error.message };
  const msg = String((error as { message?: string })?.message ?? '');
  if (/network|fetch|failed to send/i.test(msg)) return { code: 'network' };
  return { code: 'unknown' };
}

/** Llama a una Edge Function de IA. La clave del proveedor vive en el servidor, nunca aquí. */
export async function invokeAI<T>(client: SupabaseClient, name: 'food-photo' | 'workout-plan' | 'assistant-chat', body: unknown): Promise<T> {
  const { data, error } = await client.functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) {
    const e = await readError(error);
    throw new AIError(e.code, MESSAGES[e.code] ?? e.message ?? 'No se pudo completar la solicitud. Intenta de nuevo.');
  }
  return data as T;
}

export function aiErrorMessage(e: unknown): string {
  return e instanceof AIError ? e.message : 'No se pudo completar la solicitud. Intenta de nuevo.';
}

/** Etiqueta honesta del proveedor que respondió. */
export function providerLabel(provider: string | undefined): string | null {
  if (provider === 'mock') return 'Modo prueba (IA simulada)';
  if (provider === 'gemini') return 'Google Gemini';
  return provider ?? null;
}
