import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';

import { useSessionClient } from '@/features/auth/AuthProvider';
import { invokeAI } from '@/lib/ai';
import type { DraftItem, Food, Meal, MealItem, MealType, NutritionGoal, WeightLog } from './types';

const FOOD_COLS = 'id, owner_id, name_es, source, source_ref, kcal_100g, protein_g, carbs_g, fat_g, fiber_g, portion_g, portion_label';
const MEAL_COLS = 'id, user_id, eaten_at, meal_type, origin, analysis_id, photo_path, notes';
const ITEM_COLS = 'id, meal_id, food_id, name, grams, kcal, protein_g, carbs_g, fat_g, is_ai_estimate, user_edited';

/** Días de comidas que se cargan (diario, estadísticas y contexto). */
export const MEAL_HISTORY_DAYS = 90;

export const nutritionKeys = {
  meals: (uid: string) => ['meals', uid] as const,
  goal: (uid: string) => ['nutritionGoal', uid] as const,
  weights: (uid: string) => ['weights', uid] as const,
  foods: (uid: string) => ['catalogFoods', uid] as const,
  search: (uid: string, q: string) => ['foodSearch', uid, q] as const,
};

const num = <T extends Record<string, unknown>>(row: T, keys: (keyof T)[]): T => {
  const out = { ...row };
  for (const k of keys) if (out[k] != null) (out as Record<keyof T, unknown>)[k] = Number(out[k]);
  return out;
};
const toFood = (f: Food) => num(f, ['kcal_100g', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'portion_g']);
const toItem = (i: MealItem) => num(i, ['grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g']);

export function useMeals() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: nutritionKeys.meals(user.id),
    queryFn: async (): Promise<Meal[]> => {
      const since = new Date(Date.now() - MEAL_HISTORY_DAYS * 86_400_000).toISOString();
      const { data: meals, error } = await client.from('meals').select(MEAL_COLS).is('deleted_at', null).gte('eaten_at', since).order('eaten_at', { ascending: true });
      if (error) throw error;
      const ids = (meals ?? []).map((m) => m.id as string);
      if (!ids.length) return [];
      const { data: items, error: e2 } = await client.from('meal_items').select(ITEM_COLS).in('meal_id', ids);
      if (e2) throw e2;
      const byMeal = new Map<string, MealItem[]>();
      for (const it of (items ?? []) as MealItem[]) byMeal.set(it.meal_id, [...(byMeal.get(it.meal_id) ?? []), toItem(it)]);
      return ((meals ?? []) as Omit<Meal, 'items'>[]).map((m) => ({ ...m, items: byMeal.get(m.id) ?? [] }));
    },
  });
}

/** Catálogo global (para sugerencias). */
export function useCatalogFoods() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: nutritionKeys.foods(user.id),
    staleTime: 24 * 3_600_000,
    queryFn: async (): Promise<Food[]> => {
      const { data, error } = await client.from('foods').select(FOOD_COLS).is('owner_id', null).order('name_es');
      if (error) throw error;
      return ((data ?? []) as Food[]).map(toFood);
    },
  });
}

/** Búsqueda sin acentos y tolerante a errores de tipeo (función search_foods en la base). */
export function useFoodSearch(q: string) {
  const { client, user } = useSessionClient();
  const term = q.trim();
  return useQuery({
    queryKey: nutritionKeys.search(user.id, term.toLowerCase()),
    enabled: term.length >= 2,
    staleTime: 60_000,
    queryFn: async (): Promise<Food[]> => {
      const { data, error } = await client.rpc('search_foods', { q: term, max_results: 20 });
      if (error) throw error;
      return ((data ?? []) as Food[]).map(toFood);
    },
  });
}

export function useCreateCustomFood() {
  const { client, user } = useSessionClient();
  return useMutation({
    mutationFn: async (f: { name_es: string; kcal_100g: number; protein_g: number; carbs_g: number; fat_g: number; portion_g: number | null }) => {
      const { data, error } = await client
        .from('foods')
        .insert({ ...f, name_es: f.name_es.trim(), owner_id: user.id, source: 'custom', portion_label: f.portion_g ? `${f.portion_g} g` : null })
        .select(FOOD_COLS)
        .single();
      if (error) throw error;
      return toFood(data as Food);
    },
  });
}

export type NewMeal = {
  eaten_at: string;
  meal_type: MealType;
  origin: 'manual' | 'photo';
  analysis_id?: string | null;
  photo_path?: string | null;
  notes?: string | null;
  items: DraftItem[];
};

export function useAddMeal() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: NewMeal): Promise<Meal> => {
      if (!m.items.length) throw new Error('Agrega al menos un alimento.');
      const { items, ...meal } = m;
      const { data, error } = await client
        .from('meals')
        .insert({ ...meal, analysis_id: meal.analysis_id ?? null, photo_path: meal.photo_path ?? null, notes: meal.notes?.trim() || null })
        .select(MEAL_COLS)
        .single();
      if (error) throw error;
      const row = data as Omit<Meal, 'items'>;
      const { data: saved, error: e2 } = await client
        .from('meal_items')
        .insert(
          items.map((i) => ({
            meal_id: row.id,
            food_id: i.food_id,
            name: i.name.slice(0, 120),
            grams: i.grams,
            kcal: i.kcal,
            protein_g: i.protein_g,
            carbs_g: i.carbs_g,
            fat_g: i.fat_g,
            is_ai_estimate: i.is_ai_estimate,
            user_edited: i.user_edited,
          })),
        )
        .select(ITEM_COLS);
      if (e2) {
        await client.from('meals').delete().eq('id', row.id);
        throw e2;
      }
      return { ...row, items: ((saved ?? []) as MealItem[]).map(toItem) };
    },
    onSuccess: (meal) => qc.setQueryData<Meal[]>(nutritionKeys.meals(user.id), (old = []) => [...old, meal].sort((a, b) => a.eaten_at.localeCompare(b.eaten_at))),
  });
}

export function useDeleteMeal() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (meal: Pick<Meal, 'id' | 'photo_path'>) => {
      const { error } = await client.from('meals').update({ deleted_at: new Date().toISOString() }).eq('id', meal.id);
      if (error) throw error;
      // La foto (si se conservó) se borra junto con la comida.
      if (meal.photo_path) await client.storage.from('food-photos').remove([meal.photo_path]);
      return meal.id;
    },
    onSuccess: (id) => qc.setQueryData<Meal[]>(nutritionKeys.meals(user.id), (old = []) => old.filter((m) => m.id !== id)),
  });
}

export function useUpdateMealItem() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (it: Pick<MealItem, 'id' | 'grams' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>) => {
      const { data, error } = await client.from('meal_items').update({ ...it, user_edited: true }).eq('id', it.id).select(ITEM_COLS).single();
      if (error) throw error;
      return toItem(data as MealItem);
    },
    onSuccess: (item) =>
      qc.setQueryData<Meal[]>(nutritionKeys.meals(user.id), (old = []) => old.map((m) => (m.id === item.meal_id ? { ...m, items: m.items.map((i) => (i.id === item.id ? item : i)) } : m))),
  });
}

export function useDeleteMealItem() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (it: Pick<MealItem, 'id' | 'meal_id'>) => {
      const { error } = await client.from('meal_items').delete().eq('id', it.id);
      if (error) throw error;
      return it;
    },
    onSuccess: (it) =>
      qc.setQueryData<Meal[]>(nutritionKeys.meals(user.id), (old = []) => old.map((m) => (m.id === it.meal_id ? { ...m, items: m.items.filter((i) => i.id !== it.id) } : m))),
  });
}

// ------------------------------------------------------------------ objetivo y peso

export function useNutritionGoal() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: nutritionKeys.goal(user.id),
    queryFn: async (): Promise<NutritionGoal | null> => {
      const { data, error } = await client
        .from('nutrition_goals')
        .select('id, sex, tdee_kcal, kcal_target, protein_g, carbs_g, fat_g, valid_from')
        .order('valid_from', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as NutritionGoal | null) ?? null;
    },
  });
}

/** Guarda el objetivo vigente desde hoy (si ya había uno de hoy, lo reemplaza). */
export function useSaveGoal() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (g: Omit<NutritionGoal, 'id'>) => {
      const { data, error } = await client
        .from('nutrition_goals')
        .upsert({ ...g, method: 'mifflin' }, { onConflict: 'user_id,valid_from' })
        .select('id, sex, tdee_kcal, kcal_target, protein_g, carbs_g, fat_g, valid_from')
        .single();
      if (error) throw error;
      return data as NutritionGoal;
    },
    onSuccess: (g) => qc.setQueryData(nutritionKeys.goal(user.id), g),
  });
}

export function useWeights() {
  const { client, user } = useSessionClient();
  return useQuery({
    queryKey: nutritionKeys.weights(user.id),
    queryFn: async (): Promise<WeightLog[]> => {
      const { data, error } = await client.from('weight_logs').select('id, measured_on, weight_kg').order('measured_on', { ascending: true }).limit(400);
      if (error) throw error;
      return ((data ?? []) as WeightLog[]).map((w) => ({ ...w, weight_kg: Number(w.weight_kg) }));
    },
  });
}

/** Un registro por día: volver a registrar el mismo día lo corrige. */
export function useLogWeight() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (w: { measured_on: string; weight_kg: number }) => {
      const { data, error } = await client.from('weight_logs').upsert(w, { onConflict: 'user_id,measured_on' }).select('id, measured_on, weight_kg').single();
      if (error) throw error;
      return { ...(data as WeightLog), weight_kg: Number((data as WeightLog).weight_kg) };
    },
    onSuccess: (w) =>
      qc.setQueryData<WeightLog[]>(nutritionKeys.weights(user.id), (old = []) => [...old.filter((x) => x.measured_on !== w.measured_on), w].sort((a, b) => a.measured_on.localeCompare(b.measured_on))),
  });
}

export function useDeleteWeight() {
  const { client, user } = useSessionClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.from('weight_logs').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => qc.setQueryData<WeightLog[]>(nutritionKeys.weights(user.id), (old = []) => old.filter((w) => w.id !== id)),
  });
}

// ------------------------------------------------------------------ análisis de fotos

export type AnalysisItem = {
  name: string;
  grams: number;
  grams_min: number;
  grams_max: number;
  confidence: 'low' | 'medium' | 'high';
  preparation: string | null;
  source: 'database' | 'ai_estimate';
  food: Food | null;
  candidates: Food[];
  ai_per_100g: { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
  kcal: number;
  kcal_min: number;
  kcal_max: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type Analysis = {
  analysis_id: string;
  provider: string;
  model: string;
  is_food: boolean;
  items: AnalysisItem[];
  totals: { kcal: number; kcal_min: number; kcal_max: number; protein_g: number; carbs_g: number; fat_g: number };
  warnings: string[];
  photo_kept: boolean;
  photo_path: string;
};

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Sube la foto (JPEG ya reducido) a la carpeta privada del usuario y pide el análisis. */
export function useAnalyzePhoto() {
  const { client, user } = useSessionClient();
  return useMutation({
    mutationFn: async (jpegBase64: string): Promise<Analysis> => {
      const path = `${user.id}/${Crypto.randomUUID()}.jpg`;
      const { error } = await client.storage.from('food-photos').upload(path, base64ToBytes(jpegBase64), { contentType: 'image/jpeg', upsert: false });
      if (error) throw new Error(`upload: ${error.message}`);
      try {
        const r = await invokeAI<Omit<Analysis, 'photo_path'>>(client, 'food-photo', { photo_path: path });
        return { ...r, photo_path: path };
      } catch (e) {
        // Si el análisis falla antes de llegar al servidor, la foto no debe quedar guardada.
        await client.storage.from('food-photos').remove([path]);
        throw e;
      }
    },
  });
}
