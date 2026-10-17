import { AIProvider, OutputSchema } from '../_shared/ai/types.ts';
import { z } from '../_shared/deps.ts';
import { HttpError, parseInput } from '../_shared/http.ts';

export type FoodRow = {
  id: string;
  name_es: string;
  source: 'usda' | 'peru_ins' | 'custom';
  kcal_100g: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  portion_g: number | null;
  portion_label: string | null;
};

/** Lo que el handler necesita del mundo exterior (Supabase), para poder probarlo. */
export interface FoodPhotoRepo {
  consumeQuota(): Promise<void>;
  keepPhotos(): Promise<boolean>;
  downloadPhoto(path: string): Promise<Uint8Array>;
  deletePhoto(path: string): Promise<void>;
  searchFoods(q: string): Promise<FoodRow[]>;
  saveAnalysis(row: { photo_path: string | null; model: string; status: 'done' | 'failed'; result: unknown; error: string | null }): Promise<string>;
}

const MAX_BYTES = 5 * 1024 * 1024;

export const inputSchema = (userId: string) =>
  z.object({
    photo_path: z
      .string()
      .regex(new RegExp(`^${userId}/[A-Za-z0-9_-]{6,64}\\.jpg$`), 'Ruta de foto no válida.'),
  });

// ------------------------------------------------------------------ salida de la IA

const per100 = z.object({
  kcal: z.number().min(0).max(900),
  protein_g: z.number().min(0).max(100),
  carbs_g: z.number().min(0).max(100),
  fat_g: z.number().min(0).max(100),
});

const aiItem = z.object({
  name: z.string().trim().min(1).max(80),
  search_terms: z.string().trim().min(2).max(80),
  grams: z.number().min(1).max(2000),
  grams_min: z.number().min(1).max(2000),
  grams_max: z.number().min(1).max(3000),
  confidence: z.enum(['low', 'medium', 'high']),
  preparation: z.string().trim().max(60).nullable().optional(),
  ai_per_100g: per100,
});

export const aiOutput = z.object({
  is_food: z.boolean(),
  items: z.array(aiItem).max(12),
  warnings: z.array(z.string().max(200)).max(6).default([]),
});

export const OUTPUT_SCHEMA: OutputSchema = {
  type: 'OBJECT',
  properties: {
    is_food: { type: 'BOOLEAN', description: 'false si la foto no muestra comida' },
    items: {
      type: 'ARRAY',
      maxItems: 12,
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: 'nombre común en español de Perú' },
          search_terms: { type: 'STRING', description: 'nombre genérico para buscar en una tabla nutricional, p. ej. "arroz blanco cocido"' },
          grams: { type: 'NUMBER', description: 'mejor estimación del peso comestible en gramos' },
          grams_min: { type: 'NUMBER' },
          grams_max: { type: 'NUMBER' },
          confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
          preparation: { type: 'STRING', nullable: true, description: 'frito, sancochado, a la plancha…' },
          ai_per_100g: {
            type: 'OBJECT',
            properties: {
              kcal: { type: 'NUMBER' },
              protein_g: { type: 'NUMBER' },
              carbs_g: { type: 'NUMBER' },
              fat_g: { type: 'NUMBER' },
            },
            required: ['kcal', 'protein_g', 'carbs_g', 'fat_g'],
          },
        },
        required: ['name', 'search_terms', 'grams', 'grams_min', 'grams_max', 'confidence', 'ai_per_100g'],
      },
    },
    warnings: { type: 'ARRAY', items: { type: 'STRING' }, description: 'aceite, salsas o ingredientes ocultos que no se pueden ver' },
  },
  required: ['is_food', 'items', 'warnings'],
};

export const SYSTEM_PROMPT = `Eres un asistente de nutrición. Analizas fotos de comida de un usuario en Perú.
Identifica cada alimento visible por separado (no agrupes el plato entero si sus partes se distinguen).
Para cada uno estima el peso comestible en gramos con un rango realista (grams_min–grams_max) y tu nivel de confianza.
Usa referencias visuales (tamaño del plato, cubiertos, mano) cuando existan; si no hay, amplía el rango y baja la confianza.
ai_per_100g son valores aproximados por 100 g; se usan solo si el alimento no está en la base nutricional.
En warnings menciona lo que la foto no permite saber: aceite de cocción, salsas, azúcar añadida, ingredientes ocultos.
Nunca presentes las cifras como exactas. Si la imagen no muestra comida, responde is_food=false e items vacío.
No des consejos de dieta ni de ejercicio.`;

// ------------------------------------------------------------------ resultado para la app

const round1 = (n: number) => Math.round(n * 10) / 10;

export function macrosFor(per: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }, grams: number) {
  const f = grams / 100;
  return { kcal: round1(per.kcal * f), protein_g: round1(per.protein_g * f), carbs_g: round1(per.carbs_g * f), fat_g: round1(per.fat_g * f) };
}

export type ResultItem = {
  name: string;
  grams: number;
  grams_min: number;
  grams_max: number;
  confidence: 'low' | 'medium' | 'high';
  preparation: string | null;
  /** 'database' = macros de la base (USDA…), 'ai_estimate' = valores aproximados de la IA. */
  source: 'database' | 'ai_estimate';
  food: FoodRow | null;
  candidates: FoodRow[];
  ai_per_100g: z.infer<typeof per100>;
  kcal: number;
  kcal_min: number;
  kcal_max: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type AnalysisResult = {
  analysis_id: string;
  provider: string;
  model: string;
  is_food: boolean;
  items: ResultItem[];
  totals: { kcal: number; kcal_min: number; kcal_max: number; protein_g: number; carbs_g: number; fat_g: number };
  warnings: string[];
  photo_kept: boolean;
};

export async function buildItems(raw: z.infer<typeof aiOutput>, search: (q: string) => Promise<FoodRow[]>): Promise<ResultItem[]> {
  const out: ResultItem[] = [];
  for (const it of raw.items) {
    const lo = Math.min(it.grams_min, it.grams);
    const hi = Math.max(it.grams_max, it.grams);
    const candidates = (await search(it.search_terms)).slice(0, 3);
    const food = candidates[0] ?? null;
    const per = food
      ? { kcal: Number(food.kcal_100g), protein_g: Number(food.protein_g), carbs_g: Number(food.carbs_g), fat_g: Number(food.fat_g) }
      : it.ai_per_100g;
    const m = macrosFor(per, it.grams);
    out.push({
      name: it.name,
      grams: Math.round(it.grams),
      grams_min: Math.round(lo),
      grams_max: Math.round(hi),
      confidence: it.confidence,
      preparation: it.preparation ?? null,
      source: food ? 'database' : 'ai_estimate',
      food,
      candidates,
      ai_per_100g: it.ai_per_100g,
      ...m,
      kcal_min: Math.round(macrosFor(per, lo).kcal),
      kcal_max: Math.round(macrosFor(per, hi).kcal),
    });
  }
  return out;
}

export function totalsOf(items: ResultItem[]) {
  const sum = (k: 'kcal' | 'kcal_min' | 'kcal_max' | 'protein_g' | 'carbs_g' | 'fat_g') =>
    round1(items.reduce((a, i) => a + i[k], 0));
  return {
    kcal: Math.round(sum('kcal')),
    kcal_min: Math.round(sum('kcal_min')),
    kcal_max: Math.round(sum('kcal_max')),
    protein_g: sum('protein_g'),
    carbs_g: sum('carbs_g'),
    fat_g: sum('fat_g'),
  };
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function isJpeg(b: Uint8Array) {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

export async function handleFoodPhoto(body: unknown, userId: string, repo: FoodPhotoRepo, ai: AIProvider): Promise<AnalysisResult> {
  const { photo_path } = parseInput(inputSchema(userId), body);
  const keep = await repo.keepPhotos();

  try {
    const bytes = await repo.downloadPhoto(photo_path);
    if (bytes.length > MAX_BYTES) throw new HttpError(413, 'photo_too_large', 'La foto pesa más de 5 MB.');
    if (!isJpeg(bytes)) throw new HttpError(415, 'photo_not_jpeg', 'La foto debe ser JPEG.');

    await repo.consumeQuota();

    const raw = await ai.generateJson({
      purpose: 'vision',
      system: SYSTEM_PROMPT,
      parts: [
        { image: { mimeType: 'image/jpeg', base64: toBase64(bytes) } },
        { text: 'Identifica los alimentos de esta foto y estima sus porciones.' },
      ],
      schema: OUTPUT_SCHEMA,
      maxOutputTokens: 2048,
    });
    const parsed = aiOutput.safeParse(raw);
    if (!parsed.success) throw new HttpError(502, 'ai_bad_output', 'La IA devolvió un resultado incompleto. Intenta otra foto.');

    const items = parsed.data.is_food ? await buildItems(parsed.data, (q) => repo.searchFoods(q)) : [];
    const result = {
      provider: ai.name,
      model: ai.model,
      is_food: parsed.data.is_food && items.length > 0,
      items,
      totals: totalsOf(items),
      warnings: parsed.data.warnings,
      photo_kept: keep,
    };
    const analysis_id = await repo.saveAnalysis({
      photo_path: keep ? photo_path : null,
      model: `${ai.name}:${ai.model}`,
      status: 'done',
      result,
      error: null,
    });
    return { analysis_id, ...result };
  } catch (e) {
    await repo
      .saveAnalysis({
        photo_path: null,
        model: `${ai.name}:${ai.model}`,
        status: 'failed',
        result: null,
        error: e instanceof Error ? e.message.slice(0, 500) : 'error',
      })
      .catch(() => {});
    throw e;
  } finally {
    // Privacidad: por defecto la foto se borra apenas termina el análisis.
    if (!keep) await repo.deletePhoto(photo_path).catch((err) => console.error('no se pudo borrar la foto', err));
  }
}
