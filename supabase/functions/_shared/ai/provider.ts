import { HttpError } from '../http.ts';
import { GeminiProvider } from './gemini.ts';
import { MockProvider } from './mock.ts';
import { AIProvider } from './types.ts';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

type Env = { get(key: string): string | undefined };

/**
 * Elige el proveedor según los secretos de la función (nunca llegan a la app):
 *   AI_PROVIDER = gemini (por defecto) | mock
 *   GEMINI_API_KEY, GEMINI_MODEL (opcional)
 */
export function getProvider(env: Env): AIProvider {
  const kind = (env.get('AI_PROVIDER') ?? 'gemini').trim().toLowerCase();
  if (kind === 'mock') return new MockProvider();
  if (kind === 'gemini') {
    const key = env.get('GEMINI_API_KEY')?.trim();
    if (!key) throw new HttpError(503, 'ai_not_configured', 'La IA aún no está configurada en el servidor.');
    return new GeminiProvider(key, env.get('GEMINI_MODEL')?.trim() || DEFAULT_GEMINI_MODEL);
  }
  throw new HttpError(503, 'ai_not_configured', `Proveedor de IA desconocido: ${kind}`);
}

/** Límite diario por usuario y tipo de uso (configurable con secretos). */
export function dailyLimit(env: Env, kind: 'chat' | 'vision' | 'plan'): number {
  const defaults = { chat: 40, vision: 15, plan: 5 } as const;
  const raw = Number(env.get(`AI_DAILY_LIMIT_${kind.toUpperCase()}`));
  return Number.isInteger(raw) && raw >= 1 && raw <= 1000 ? raw : defaults[kind];
}
