import { AIResponseError } from './ai/types.ts';
import { createSupabaseContext, type SupabaseClient } from './deps.ts';
import { errorResponse, HttpError, json, readBody } from './http.ts';

export type UserContext = {
  /** Cliente con la sesión del usuario: todo pasa por RLS. Nunca se usa service_role. */
  supabase: SupabaseClient;
  userId: string;
};

export function aiErrorToHttp(e: unknown): unknown {
  if (!(e instanceof AIResponseError)) return e;
  const status = { rate_limited: 429, blocked: 422, bad_output: 502, upstream: 502, misconfigured: 503, timeout: 504 }[e.code];
  return new HttpError(status, `ai_${e.code}`, e.message);
}

/** Envuelve un handler: valida la sesión del usuario, lee el JSON y traduce errores. */
export function serveUser(handler: (body: unknown, ctx: UserContext) => Promise<unknown>) {
  return {
    fetch: async (req: Request): Promise<Response> => {
      try {
        const { data: ctx, error } = await createSupabaseContext(req, { auth: 'user' });
        if (error || !ctx?.userClaims?.id) {
          return json({ error: { code: 'unauthorized', message: 'Inicia sesión de nuevo.' } }, error?.status ?? 401);
        }
        const body = await readBody(req);
        return json(await handler(body, { supabase: ctx.supabase as unknown as SupabaseClient, userId: ctx.userClaims.id }));
      } catch (e) {
        return errorResponse(aiErrorToHttp(e));
      }
    },
  };
}

/** Consume una unidad de la cuota diaria (contador atómico en la base). */
export async function consumeQuota(supabase: SupabaseClient, kind: 'chat' | 'vision' | 'plan', limit: number) {
  const { data, error } = await supabase.rpc('consume_ai_quota', { kind, daily_limit: limit });
  if (error) throw new Error(`consume_ai_quota: ${error.message}`);
  if (data !== true) {
    throw new HttpError(429, 'quota_exceeded', `Alcanzaste el límite diario de ${limit} usos. Se reinicia mañana.`);
  }
}
