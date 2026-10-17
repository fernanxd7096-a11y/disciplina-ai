import { z } from './deps.ts';

/** Error con código estable que la app traduce a un mensaje en español. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: { code: e.code, message: e.message } }, e.status);
  console.error('error no controlado', e);
  return json({ error: { code: 'internal', message: 'Error interno.' } }, 500);
}

export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new HttpError(400, 'invalid_input', r.error.issues.map((i) => i.message).join('; '));
  return r.data;
}

export async function readBody(req: Request): Promise<unknown> {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Usa POST.');
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'invalid_json', 'El cuerpo no es JSON válido.');
  }
}
