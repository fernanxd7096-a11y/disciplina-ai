/**
 * Contrato de proveedor de IA (ADR D4). Las funciones solo conocen esta
 * interfaz; cambiar de proveedor = escribir otro adaptador y cambiar AI_PROVIDER.
 */

export type Part = { text: string } | { image: { mimeType: 'image/jpeg'; base64: string } };

export type Turn = { role: 'user' | 'assistant'; text: string };

/** Esquema de salida en el subconjunto OpenAPI que aceptan los proveedores. */
export type OutputSchema = Record<string, unknown>;

export type Purpose = 'vision' | 'plan' | 'chat';

export interface GenerateJsonRequest {
  purpose: Purpose;
  system: string;
  history?: Turn[];
  parts: Part[];
  schema: OutputSchema;
  maxOutputTokens?: number;
}

export interface AIProvider {
  /** 'gemini' | 'mock' … se muestra en la app para distinguir el modo prueba. */
  readonly name: string;
  readonly model: string;
  generateJson(req: GenerateJsonRequest): Promise<unknown>;
}

/** El proveedor respondió, pero no con algo usable (bloqueo, JSON roto, límite). */
export class AIResponseError extends Error {
  constructor(
    public code: 'rate_limited' | 'blocked' | 'bad_output' | 'upstream' | 'misconfigured' | 'timeout',
    message: string,
  ) {
    super(message);
  }
}
