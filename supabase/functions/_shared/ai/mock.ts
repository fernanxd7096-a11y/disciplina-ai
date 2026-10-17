import { AIProvider, GenerateJsonRequest } from './types.ts';

/**
 * Modo prueba (AI_PROVIDER=mock): respuestas fijas, sin red ni costo, para
 * desarrollar sin clave. La app muestra "Modo prueba" cuando el proveedor es
 * 'mock', así nunca se confunde con un análisis real.
 */
export class MockProvider implements AIProvider {
  readonly name = 'mock';
  readonly model = 'mock';
  readonly calls: GenerateJsonRequest[] = [];

  constructor(private overrides: Partial<Record<GenerateJsonRequest['purpose'], (r: GenerateJsonRequest) => unknown>> = {}) {}

  generateJson(req: GenerateJsonRequest): Promise<unknown> {
    this.calls.push(req);
    const fn = this.overrides[req.purpose] ?? DEFAULTS[req.purpose];
    return Promise.resolve(fn(req));
  }
}

const DEFAULTS: Record<GenerateJsonRequest['purpose'], (r: GenerateJsonRequest) => unknown> = {
  vision: () => ({
    is_food: true,
    items: [
      {
        name: 'Arroz blanco',
        search_terms: 'arroz blanco cocido',
        grams: 180,
        grams_min: 140,
        grams_max: 230,
        confidence: 'medium',
        preparation: 'cocido',
        ai_per_100g: { kcal: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3 },
      },
      {
        name: 'Pollo a la plancha',
        search_terms: 'pechuga de pollo cocida',
        grams: 120,
        grams_min: 90,
        grams_max: 150,
        confidence: 'medium',
        preparation: 'a la plancha',
        ai_per_100g: { kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 },
      },
    ],
    warnings: ['Modo prueba: este resultado es fijo y no analiza tu foto.'],
  }),
  plan: (r) => {
    // El handler incluye los códigos permitidos en la última parte de texto.
    const last = r.parts.filter((p) => 'text' in p).at(-1) as { text: string } | undefined;
    const codes = [...(last?.text.matchAll(/"code":"([a-z0-9_]+)"/g) ?? [])].map((m) => m[1]);
    const days = Number(/"days_per_week":(\d)/.exec(last?.text ?? '')?.[1] ?? 3);
    return {
      name: 'Rutina de prueba',
      notes: 'Modo prueba: rutina fija para desarrollo.',
      safety_notes: [],
      days: Array.from({ length: days }, (_, i) => ({
        label: `Día ${i + 1}`,
        exercises: codes.slice(i % Math.max(codes.length, 1), (i % Math.max(codes.length, 1)) + 3).map((code) => ({
          code,
          sets: 3,
          reps_min: 8,
          reps_max: 12,
          rest_seconds: 90,
          suggested_kg: null,
        })),
      })),
    };
  },
  chat: () => ({
    reply: 'Modo prueba: la IA no está conectada. Así se vería una respuesta del asistente.',
    actions: [],
  }),
};
