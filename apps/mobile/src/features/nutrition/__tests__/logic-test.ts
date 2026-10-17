import { ageOn, defaultMealType, draftFromFood, hasEstimates, mifflinBMR, missingBodyData, planGoal, scaleMacros, suggestFoods, sumMacros, tdee, trendWarning, weeklyTrend, withGrams } from '../logic';
import type { Food } from '../types';

const today = '2026-10-16';
const fernando = { sex: 'male' as const, birth_date: '2007-03-10', height_cm: 175, weight_kg: 80, activity_level: 'moderate' as const };

const food = (name: string, kcal: number, p: number, c: number, f: number, portion = 100): Food => ({
  id: name, owner_id: null, name_es: name, source: 'usda', source_ref: null, kcal_100g: kcal, protein_g: p, carbs_g: c, fat_g: f, fiber_g: null, portion_g: portion, portion_label: null,
});

describe('gasto energético y objetivo', () => {
  it('Mifflin-St Jeor y factor de actividad', () => {
    expect(ageOn('2007-03-10', today)).toBe(19);
    expect(ageOn('2007-10-17', today)).toBe(18);
    expect(mifflinBMR({ sex: 'male', weight_kg: 80, height_cm: 175, age: 19 })).toBe(1803.75);
    expect(mifflinBMR({ sex: 'female', weight_kg: 60, height_cm: 160, age: 30 })).toBe(1289);
    expect(tdee(1804, 'moderate')).toBe(2796);
  });

  it('un déficit moderado queda dentro de los márgenes seguros', () => {
    const g = planGoal(fernando, 'lose', 'moderate', today);
    if ('reason' in g) throw new Error(g.reason);
    expect(g.tdee).toBe(2796);
    expect(g.kcal_target).toBe(2240); // −20 %
    expect(g.kcal_target).toBeGreaterThanOrEqual(Math.ceil(g.tdee * 0.75));
    expect(g.protein_g).toBe(144); // 1,8 g/kg
    expect(g.protein_g * 4 + g.carbs_g * 4 + g.fat_g * 9).toBeLessThanOrEqual(g.kcal_target + 10);
  });

  it('nunca baja del mínimo por sexo', () => {
    const small = { sex: 'female' as const, birth_date: '1990-01-01', height_cm: 150, weight_kg: 45, activity_level: 'sedentary' as const };
    const g = planGoal(small, 'lose', 'moderate', today);
    if ('reason' in g) {
      expect(g.reason).toMatch(/mínimo seguro/);
    } else {
      expect(g.kcal_target).toBeGreaterThanOrEqual(1200);
    }
  });

  it('el superávit no supera el 20 %', () => {
    const g = planGoal(fernando, 'gain', 'moderate', today);
    if ('reason' in g) throw new Error(g.reason);
    expect(g.kcal_target).toBeLessThanOrEqual(Math.floor(g.tdee * 1.2));
    expect(g.kcal_target).toBeGreaterThan(g.tdee);
  });

  it('a menores de 18 no les propone déficit', () => {
    const teen = { ...fernando, birth_date: '2010-01-01' };
    const g = planGoal(teen, 'lose', 'moderate', today);
    if ('reason' in g) throw new Error(g.reason);
    expect(Math.abs(g.kcal_target - g.tdee)).toBeLessThanOrEqual(5); // mantener (redondeado a 10)
    expect(g.notes.join(' ')).toMatch(/menores de 18/);
  });

  it('pide los datos que faltan en vez de inventarlos', () => {
    expect(missingBodyData({ sex: null, birth_date: null, height_cm: 170, activity_level: null, weight_kg: null })).toEqual(['sexo', 'fecha de nacimiento', 'peso actual', 'nivel de actividad']);
  });
});

describe('comidas', () => {
  const arroz = food('Arroz blanco cocido', 130, 2.7, 28.2, 0.3, 150);

  it('calcula macros por gramos y suma', () => {
    expect(scaleMacros({ kcal: 130, protein_g: 2.7, carbs_g: 28.2, fat_g: 0.3 }, 200)).toEqual({ kcal: 260, protein_g: 5.4, carbs_g: 56.4, fat_g: 0.6 });
    const d = draftFromFood(arroz);
    expect(d.grams).toBe(150);
    expect(d.kcal).toBe(195);
    const e = withGrams(d, 100);
    expect([e.kcal, e.user_edited]).toEqual([130, true]);
    expect(sumMacros([d, e]).kcal).toBe(325);
  });

  it('tipo de comida según la hora', () => {
    expect([7, 13, 17, 20, 2].map(defaultMealType)).toEqual(['breakfast', 'lunch', 'snack', 'dinner', 'snack']);
  });

  it('marca como estimada una comida con datos de IA sin corregir', () => {
    expect(hasEstimates([{ is_ai_estimate: true, user_edited: false }])).toBe(true);
    expect(hasEstimates([{ is_ai_estimate: true, user_edited: true }])).toBe(false);
  });
});

describe('sugerencias', () => {
  const foods = [food('Huevo sancochado', 155, 12.6, 1.1, 10.6, 50), food('Lentejas cocidas', 116, 9, 20, 0.4, 200), food('Plátano de seda', 89, 1.1, 22.8, 0.3, 120), food('Arroz blanco cocido', 130, 2.7, 28.2, 0.3, 150)];

  it('si ya llegaste a la meta no sugiere compensar', () => {
    const s = suggestFoods({ kcal: -200, protein_g: 0, carbs_g: 0, fat_g: 0 }, foods);
    expect(s.items).toHaveLength(0);
    expect(s.message).toMatch(/No hace falta compensar/);
    expect(s.message).not.toMatch(/ejercicio|quemar/i);
  });

  it('prioriza proteína económica cuando falta', () => {
    const s = suggestFoods({ kcal: 600, protein_g: 40, carbs_g: 50, fat_g: 10 }, foods);
    expect(s.items.map((i) => i.food.name_es)).toEqual(['Huevo sancochado', 'Lentejas cocidas']);
  });

  it('con poco margen sugiere fruta', () => {
    expect(suggestFoods({ kcal: 150, protein_g: 5, carbs_g: 20, fat_g: 2 }, foods).items[0].food.name_es).toBe('Plátano de seda');
  });
});

describe('peso', () => {
  const logs = [
    { id: '1', measured_on: '2026-09-20', weight_kg: 82 },
    { id: '2', measured_on: '2026-10-04', weight_kg: 81 },
    { id: '3', measured_on: '2026-10-16', weight_kg: 80 },
  ];
  it('tendencia semanal y aviso de ritmo rápido', () => {
    expect(weeklyTrend(logs, today)).toBe(-0.54);
    expect(trendWarning(-0.54, 80)).toBeNull();
    expect(trendWarning(-1.2, 80)).toMatch(/más de 1 %/);
    expect(weeklyTrend(logs.slice(0, 1), today)).toBeNull();
  });
});
