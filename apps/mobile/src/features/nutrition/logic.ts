import type { ActivityLevel, Sex } from '@/features/profile/api';
import type { DraftItem, Food, Macros, MealItem, MealType, Pace, WeightGoal, WeightLog } from './types';

// ------------------------------------------------------------------ gasto energético

export const ACTIVITY_FACTORS: Record<ActivityLevel, { factor: number; label: string; hint: string }> = {
  sedentary: { factor: 1.2, label: 'Sedentario', hint: 'Trabajo sentado y casi sin ejercicio' },
  light: { factor: 1.375, label: 'Ligero', hint: 'Ejercicio 1–3 días por semana' },
  moderate: { factor: 1.55, label: 'Moderado', hint: 'Ejercicio 3–5 días por semana' },
  active: { factor: 1.725, label: 'Activo', hint: 'Ejercicio intenso 6–7 días por semana' },
  very_active: { factor: 1.9, label: 'Muy activo', hint: 'Trabajo físico pesado o doble sesión diaria' },
};

/** Límites de seguridad (los mismos que impone la base de datos). */
export const MIN_KCAL: Record<Sex, number> = { male: 1500, female: 1200 };
export const MAX_DEFICIT = 0.25;
export const MAX_SURPLUS = 0.2;

export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** Metabolismo basal estimado con Mifflin-St Jeor (kcal/día). */
export function mifflinBMR(p: { sex: Sex; weight_kg: number; height_cm: number; age: number }) {
  return 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
}

export function tdee(bmr: number, activity: ActivityLevel) {
  return Math.round(bmr * ACTIVITY_FACTORS[activity].factor);
}

export type BodyData = { sex: Sex | null; birth_date: string | null; height_cm: number | null; activity_level: ActivityLevel | null; weight_kg: number | null };

/** Datos que faltan para calcular (se piden al usuario; nunca se inventan). */
export function missingBodyData(b: BodyData): string[] {
  const out: string[] = [];
  if (!b.sex) out.push('sexo');
  if (!b.birth_date) out.push('fecha de nacimiento');
  if (!b.height_cm) out.push('altura');
  if (!b.weight_kg) out.push('peso actual');
  if (!b.activity_level) out.push('nivel de actividad');
  return out;
}

export type GoalPlan = {
  bmr: number;
  tdee: number;
  kcal_target: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  notes: string[];
};

/**
 * Objetivo calórico con márgenes moderados. Nunca baja del mínimo por sexo, nunca
 * supera un 25 % de déficit ni un 20 % de superávit. Devuelve null si no hay un
 * objetivo seguro posible (y la razón en `reason`).
 */
export function planGoal(b: Required<{ [K in keyof BodyData]: NonNullable<BodyData[K]> }>, goal: WeightGoal, pace: Pace, today: string): GoalPlan | { reason: string } {
  const age = ageOn(b.birth_date, today);
  if (age < 13) return { reason: 'La app es para mayores de 13 años.' };
  const bmr = Math.round(mifflinBMR({ sex: b.sex, weight_kg: b.weight_kg, height_cm: b.height_cm, age }));
  const total = tdee(bmr, b.activity_level);
  const notes = ['Es una estimación con la fórmula Mifflin-St Jeor: tu gasto real puede variar ±10 % o más. Ajusta según cómo evolucione tu peso en 2–3 semanas.'];

  let effectiveGoal = goal;
  if (age < 18 && goal !== 'maintain') {
    effectiveGoal = 'maintain';
    notes.push('En menores de 18 años no se proponen déficits ni superávits: consulta a un profesional de salud para un plan.');
  }
  const factor = effectiveGoal === 'lose' ? 1 - (pace === 'gentle' ? 0.1 : 0.2) : effectiveGoal === 'gain' ? 1 + (pace === 'gentle' ? 0.05 : 0.1) : 1;
  const lo = Math.max(MIN_KCAL[b.sex], Math.ceil(total * (1 - MAX_DEFICIT)));
  const hi = Math.floor(total * (1 + MAX_SURPLUS));
  if (lo > hi) return { reason: 'Con estos datos no hay un objetivo dentro de los márgenes seguros. Revisa los datos o consulta a un profesional.' };
  const wanted = Math.round((total * factor) / 10) * 10;
  const kcal = Math.min(hi, Math.max(lo, wanted));
  if (effectiveGoal === 'lose' && kcal > wanted) notes.push(`Se ajustó al mínimo seguro de ${kcal} kcal.`);
  if (effectiveGoal === 'lose' && kcal >= total) {
    return { reason: `Tu gasto estimado (${total} kcal) ya está cerca del mínimo seguro; no se propone déficit. Prioriza actividad diaria y comida de calidad, o consulta a un profesional.` };
  }

  // Proteína por kg (1,6–1,8 g/kg), grasa ~27 % (mín. 0,6 g/kg), resto carbohidratos.
  const protein = Math.round(Math.min(b.weight_kg * (effectiveGoal === 'maintain' ? 1.6 : 1.8), (kcal * 0.35) / 4));
  const fat = Math.round(Math.max((kcal * 0.27) / 9, b.weight_kg * 0.6));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { bmr, tdee: total, kcal_target: kcal, protein_g: Math.min(protein, 400), carbs_g: Math.min(carbs, 900), fat_g: Math.min(fat, 300), notes };
}

// ------------------------------------------------------------------ comidas

const r1 = (n: number) => Math.round(n * 10) / 10;

export function per100Of(f: Pick<Food, 'kcal_100g' | 'protein_g' | 'carbs_g' | 'fat_g'>): Macros {
  return { kcal: Number(f.kcal_100g), protein_g: Number(f.protein_g), carbs_g: Number(f.carbs_g), fat_g: Number(f.fat_g) };
}

export function scaleMacros(per100: Macros, grams: number): Macros {
  const f = grams / 100;
  return { kcal: r1(per100.kcal * f), protein_g: r1(per100.protein_g * f), carbs_g: r1(per100.carbs_g * f), fat_g: r1(per100.fat_g * f) };
}

export function sumMacros(items: Macros[]): Macros {
  return items.reduce<Macros>(
    (a, i) => ({ kcal: r1(a.kcal + Number(i.kcal)), protein_g: r1(a.protein_g + Number(i.protein_g)), carbs_g: r1(a.carbs_g + Number(i.carbs_g)), fat_g: r1(a.fat_g + Number(i.fat_g)) }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

let keySeq = 0;
export function draftFromFood(food: Food, grams?: number): DraftItem {
  const g = grams ?? Number(food.portion_g ?? 100);
  const per100 = per100Of(food);
  keySeq += 1;
  return { key: `d${keySeq}`, food_id: food.id, name: food.name_es, grams: g, per100, ...scaleMacros(per100, g), is_ai_estimate: false, user_edited: false };
}

export function withGrams(item: DraftItem, grams: number): DraftItem {
  return { ...item, grams, ...scaleMacros(item.per100, grams), user_edited: true };
}

export const mealTypeLabels: Record<MealType, string> = {
  breakfast: 'Desayuno',
  lunch: 'Almuerzo',
  dinner: 'Cena',
  snack: 'Snack',
};
export const mealOrder: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

export function defaultMealType(hour: number): MealType {
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 18 && hour < 23) return 'dinner';
  return 'snack';
}

/** ¿Algún dato de la comida es una estimación de la IA sin corregir? */
export function hasEstimates(items: Pick<MealItem, 'is_ai_estimate' | 'user_edited'>[]) {
  return items.some((i) => i.is_ai_estimate && !i.user_edited);
}

// ------------------------------------------------------------------ sugerencias

/** Alimentos habituales y económicos en Perú presentes en la base (por nombre). */
const ECONOMIC_PROTEIN = ['Huevo sancochado', 'Lentejas cocidas', 'Frejol negro cocido', 'Atún en agua (lata, escurrido)', 'Pechuga de pollo cocida (sin piel)', 'Queso fresco', 'Yogur natural entero', 'Garbanzos cocidos'];
const ECONOMIC_LIGHT = ['Plátano de seda', 'Mandarina', 'Papaya', 'Manzana', 'Naranja', 'Pepino', 'Zanahoria', 'Tomate'];
const ECONOMIC_BASE = ['Arroz blanco cocido', 'Papa sancochada (sin cáscara)', 'Camote sancochado', 'Quinua cocida', 'Choclo sancochado', 'Avena en hojuelas (cruda)'];

export type Suggestion = { food: Food; grams: number; macros: Macros; why: string };

/**
 * Ideas para lo que queda del día. Nunca sugiere "compensar" comidas; si ya se
 * superó la meta, solo recomienda volver a la normalidad mañana.
 */
export function suggestFoods(remaining: Macros, foods: Food[], max = 4): { message: string; items: Suggestion[] } {
  const byName = new Map(foods.filter((f) => f.owner_id == null).map((f) => [f.name_es, f]));
  const pick = (names: string[], why: string) =>
    names
      .map((n) => byName.get(n))
      .filter((f): f is Food => !!f)
      .map((f) => {
        const grams = Number(f.portion_g ?? 100);
        return { food: f, grams, macros: scaleMacros(per100Of(f), grams), why };
      });

  if (remaining.kcal <= 0) {
    return { message: 'Ya llegaste a tu meta de hoy. No hace falta compensar: mañana sigues con tu plan normal.', items: [] };
  }
  if (remaining.protein_g >= 20) {
    const items = pick(ECONOMIC_PROTEIN, 'aporta proteína a buen precio').filter((s) => s.macros.kcal <= remaining.kcal + 50);
    return { message: `Te faltan unos ${Math.round(remaining.protein_g)} g de proteína (aprox.). Opciones económicas:`, items: items.slice(0, max) };
  }
  if (remaining.kcal < 250) {
    return { message: 'Te queda poco margen: una fruta o verdura es buena opción.', items: pick(ECONOMIC_LIGHT, 'ligera y con fibra').slice(0, max) };
  }
  return { message: 'Para completar el día, un plato equilibrado: una base, una proteína y verduras.', items: [...pick(ECONOMIC_BASE, 'energía (base)').slice(0, 2), ...pick(ECONOMIC_PROTEIN, 'proteína').slice(0, 2)].slice(0, max) };
}

// ------------------------------------------------------------------ peso

/** Cambio semanal promedio (kg/semana) entre el primer y el último registro de los últimos `days`. */
export function weeklyTrend(logs: WeightLog[], today: string, days = 28): number | null {
  const since = new Date(`${today}T00:00:00Z`).getTime() - days * 86_400_000;
  const pts = logs.filter((l) => new Date(`${l.measured_on}T00:00:00Z`).getTime() >= since).sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  if (pts.length < 2) return null;
  const first = pts[0];
  const last = pts.at(-1)!;
  const weeks = (new Date(`${last.measured_on}T00:00:00Z`).getTime() - new Date(`${first.measured_on}T00:00:00Z`).getTime()) / (7 * 86_400_000);
  if (weeks < 1) return null;
  return Math.round(((Number(last.weight_kg) - Number(first.weight_kg)) / weeks) * 100) / 100;
}

/** Aviso si se baja más de ~1 % del peso por semana de forma sostenida. */
export function trendWarning(trend: number | null, weightKg: number | null): string | null {
  if (trend == null || !weightKg) return null;
  if (trend < -0.01 * weightKg) return 'Estás bajando más de 1 % de tu peso por semana. Un ritmo más lento es más sostenible: considera comer un poco más.';
  return null;
}
