export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type Food = {
  id: string;
  owner_id: string | null;
  name_es: string;
  source: 'usda' | 'peru_ins' | 'custom';
  source_ref: string | null;
  kcal_100g: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  portion_g: number | null;
  portion_label: string | null;
};

export type Macros = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };

export type MealItem = Macros & {
  id: string;
  meal_id: string;
  food_id: string | null;
  name: string;
  grams: number;
  is_ai_estimate: boolean;
  user_edited: boolean;
};

export type Meal = {
  id: string;
  user_id: string;
  eaten_at: string;
  meal_type: MealType;
  origin: 'manual' | 'photo';
  analysis_id: string | null;
  photo_path: string | null;
  notes: string | null;
  items: MealItem[];
};

/** Alimento a punto de guardarse en una comida. */
export type DraftItem = Macros & {
  key: string;
  food_id: string | null;
  name: string;
  grams: number;
  is_ai_estimate: boolean;
  user_edited: boolean;
  /** Por 100 g, para recalcular al cambiar los gramos. */
  per100: Macros;
};

export type NutritionGoal = {
  id: string;
  sex: 'male' | 'female';
  tdee_kcal: number;
  kcal_target: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  valid_from: string;
};

export type WeightLog = { id: string; measured_on: string; weight_kg: number };

export type WeightGoal = 'lose' | 'maintain' | 'gain';
export type Pace = 'gentle' | 'moderate';
