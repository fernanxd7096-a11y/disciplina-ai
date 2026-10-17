import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import type { FakeSupabase } from '@/test/fakeSupabase';
import { photoAsset, setPicker } from '@/test/picker';
import { signedInFake } from '@/test/setup';

const APP_DIR = './src/app';

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el);
  });
}

const FOODS = [
  { id: 'f-arroz', owner_id: null, name_es: 'Arroz blanco cocido', source: 'usda', source_ref: 'r1', kcal_100g: 130, protein_g: 2.7, carbs_g: 28.2, fat_g: 0.3, fiber_g: 0.4, portion_g: 150, portion_label: '1 taza' },
  { id: 'f-pollo', owner_id: null, name_es: 'Pechuga de pollo cocida (sin piel)', source: 'usda', source_ref: 'r2', kcal_100g: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, fiber_g: 0, portion_g: 120, portion_label: '1 filete' },
  { id: 'f-huevo', owner_id: null, name_es: 'Huevo sancochado', source: 'usda', source_ref: 'r3', kcal_100g: 155, protein_g: 12.6, carbs_g: 1.1, fat_g: 10.6, fiber_g: 0, portion_g: 50, portion_label: '1 huevo' },
];

function seedFoods(fake: FakeSupabase) {
  fake.seed('foods', FOODS.map((f) => ({ ...f })));
}

function seedGoal(fake: FakeSupabase) {
  fake.seed('nutrition_goals', [{ id: 'g1', user_id: fake.session!.user.id, sex: 'male', tdee_kcal: 2800, kcal_target: 2240, protein_g: 144, carbs_g: 260, fat_g: 67, valid_from: '2026-10-01' }]);
}

describe('nutrición', () => {
  it('calcula el objetivo: pide datos que faltan y guarda uno seguro', async () => {
    const fake = signedInFake();
    renderRouter(APP_DIR, { initialUrl: '/nutrition/goal' });

    expect((await screen.findByTestId('goal-missing'))).toBeTruthy();
    expect(screen.getByText(/necesito: sexo, fecha de nacimiento, altura, peso actual, nivel de actividad/)).toBeTruthy();
    await press(screen.getByRole('tab', { name: 'Hombre' }));
    fireEvent.changeText(screen.getByTestId('goal-height'), '175');
    fireEvent.changeText(screen.getByTestId('goal-weight'), '80');
    await press(screen.getByTestId('activity-moderate'));
    // Sin fecha de nacimiento todavía no calcula
    expect(screen.getByText(/necesito: fecha de nacimiento/)).toBeTruthy();
    fake.tables.profiles[0].birth_date = null;
    await act(async () => {
      fireEvent(screen.getByTestId('goal-birth-date'), 'press');
    });
    // El selector nativo no existe en pruebas: se simula la elección directamente
    const field = screen.UNSAFE_getAllByProps({ testID: 'goal-birth' })[0];
    await act(async () => {
      field.props.onChange('2007-03-10', '00:00');
    });
    await press(screen.getByRole('tab', { name: 'Bajar grasa' }));
    await press(screen.getByRole('tab', { name: 'Moderado (−20 %)' }));
    const result = await screen.findByTestId('goal-result');
    expect(within(result).getByText('2240 kcal/día')).toBeTruthy();
    await press(screen.getByTestId('save-goal'));

    await waitFor(() => expect(fake.rows('nutrition_goals')).toHaveLength(1));
    expect(fake.rows('nutrition_goals')[0]).toMatchObject({ sex: 'male', kcal_target: 2240, tdee_kcal: 2796, method: 'mifflin' });
    expect(fake.rows('profiles')[0]).toMatchObject({ sex: 'male', height_cm: 175, activity_level: 'moderate', birth_date: '2007-03-10' });
    expect(fake.rows('weight_logs')[0]).toMatchObject({ weight_kg: 80 });
  });

  it('registra una comida a mano con el buscador y actualiza el resumen del día', async () => {
    const fake = signedInFake();
    seedFoods(fake);
    seedGoal(fake);
    renderRouter(APP_DIR, { initialUrl: '/nutrition' });

    expect(await screen.findByTestId('no-meals-today')).toBeTruthy();
    await press(screen.getByTestId('add-manual'));
    fireEvent.changeText(await screen.findByTestId('food-search'), 'arroz');
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await press(await screen.findByTestId('food-f-arroz'));
    const grams = await screen.findByTestId('draft-f-arroz-grams');
    fireEvent.changeText(grams, '200');
    fireEvent(grams, 'endEditing', { nativeEvent: { text: '200' } });
    await press(screen.getByRole('tab', { name: 'Almuerzo' }));
    await press(screen.getByTestId('save-meal'));

    await waitFor(() => expect(fake.rows('meals')).toHaveLength(1));
    expect(fake.rows('meals')[0]).toMatchObject({ meal_type: 'lunch', origin: 'manual' });
    expect(fake.rows('meal_items')[0]).toMatchObject({ food_id: 'f-arroz', grams: 200, kcal: 260, is_ai_estimate: false, user_edited: true });
    await waitFor(() => expect(within(screen.getByTestId('nutrition-today')).getByText('260')).toBeTruthy());
    expect(screen.getByTestId('suggestions')).toBeTruthy();
  });

  it('crea un alimento propio cuando no está en la base', async () => {
    const fake = signedInFake();
    seedFoods(fake);
    renderRouter(APP_DIR, { initialUrl: '/nutrition/add' });
    fireEvent.changeText(await screen.findByTestId('food-search'), 'batido casero');
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(await screen.findByTestId('food-search-empty')).toBeTruthy();
    await press(screen.getByTestId('create-food'));
    fireEvent.changeText(screen.getByTestId('custom-kcal'), '80');
    fireEvent.changeText(screen.getByTestId('custom-protein'), '60');
    fireEvent.changeText(screen.getByTestId('custom-carbs'), '50');
    fireEvent.changeText(screen.getByTestId('custom-fat'), '1');
    await press(screen.getByTestId('custom-save'));
    expect(await screen.findByText(/no pueden superar 100 g/)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('custom-protein'), '6');
    await press(screen.getByTestId('custom-save'));
    await waitFor(() => expect(fake.rows('foods').find((f) => f.source === 'custom')).toMatchObject({ name_es: 'batido casero', owner_id: fake.session!.user.id, kcal_100g: 80 }));
    expect(await screen.findByTestId('draft-items')).toBeTruthy();
  });

  it('foto: sube a la carpeta privada, muestra estimación editable y guarda con su origen', async () => {
    const fake = signedInFake();
    seedFoods(fake);
    setPicker({ result: photoAsset(), granted: true });
    let uploadedPath = '';
    fake.functionHandlers['food-photo'] = (body) => {
      uploadedPath = (body as { photo_path: string }).photo_path;
      return {
        data: {
          analysis_id: 'an-1',
          provider: 'gemini',
          model: 'gemini-3.6-flash',
          is_food: true,
          photo_kept: false,
          warnings: ['No se ve cuánto aceite se usó.'],
          totals: { kcal: 432, kcal_min: 330, kcal_max: 540, protein_g: 42, carbs_g: 50, fat_g: 5 },
          items: [
            { name: 'Arroz', grams: 180, grams_min: 140, grams_max: 230, confidence: 'medium', preparation: 'cocido', source: 'database', food: FOODS[0], candidates: [FOODS[0]], ai_per_100g: { kcal: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3 }, kcal: 234, kcal_min: 182, kcal_max: 299, protein_g: 4.9, carbs_g: 50.8, fat_g: 0.5 },
            { name: 'Salsa huancaína', grams: 40, grams_min: 20, grams_max: 60, confidence: 'low', preparation: null, source: 'ai_estimate', food: null, candidates: [], ai_per_100g: { kcal: 300, protein_g: 6, carbs_g: 10, fat_g: 26 }, kcal: 120, kcal_min: 60, kcal_max: 180, protein_g: 2.4, carbs_g: 4, fat_g: 10.4 },
          ],
        },
      };
    };
    renderRouter(APP_DIR, { initialUrl: '/nutrition/photo' });
    await press(await screen.findByTestId('photo-camera'));

    expect(await screen.findByText('Analizado con Google Gemini')).toBeTruthy();
    expect(uploadedPath).toMatch(new RegExp(`^${fake.session!.user.id}/[0-9a-f-]+\\.jpg$`));
    expect(fake.files.has(`food-photos/${uploadedPath}`)).toBe(true);
    expect(screen.getByText('⚠ No se ve cuánto aceite se usó.')).toBeTruthy();
    expect(screen.getByText('Confianza baja')).toBeTruthy();
    expect(screen.getAllByText('Estimación IA').length).toBe(1);
    expect(screen.getByText('~354 kcal')).toBeTruthy();
    expect(screen.getByText('Rango probable: 242–479 kcal')).toBeTruthy();

    // Corrige los gramos del arroz
    const g = screen.getByTestId('photo-f-arroz-grams');
    fireEvent.changeText(g, '150');
    fireEvent(g, 'endEditing', { nativeEvent: { text: '150' } });
    expect(await screen.findByText('~315 kcal')).toBeTruthy();
    await press(screen.getByTestId('save-photo-meal'));

    await waitFor(() => expect(fake.rows('meals')).toHaveLength(1));
    expect(fake.rows('meals')[0]).toMatchObject({ origin: 'photo', analysis_id: 'an-1', photo_path: null });
    const items = fake.rows('meal_items');
    expect(items.find((i) => i.food_id === 'f-arroz')).toMatchObject({ grams: 150, is_ai_estimate: false, user_edited: true });
    expect(items.find((i) => i.food_id === null)).toMatchObject({ name: 'Salsa huancaína', is_ai_estimate: true, user_edited: false });
    expect(await screen.findByTestId('nutrition-screen')).toBeTruthy();
  });

  it('foto: sin IA configurada lo dice claro y no deja la foto guardada', async () => {
    const fake = signedInFake();
    setPicker({ result: photoAsset(800, 600), granted: true });
    fake.functionHandlers['food-photo'] = () => ({
      error: { message: 'non-2xx', context: new Response(JSON.stringify({ error: { code: 'ai_not_configured', message: 'x' } }), { status: 503 }) },
    });
    renderRouter(APP_DIR, { initialUrl: '/nutrition/photo' });
    await press(await screen.findByTestId('photo-library'));
    expect(await screen.findByText(/La IA todavía no está configurada/)).toBeTruthy();
    expect(fake.files.size).toBe(0);
    expect(fake.rows('meals')).toHaveLength(0);
  });

  it('foto: sin permiso de cámara explica cómo activarlo', async () => {
    signedInFake();
    setPicker({ granted: false });
    renderRouter(APP_DIR, { initialUrl: '/nutrition/photo' });
    await press(await screen.findByTestId('photo-camera'));
    expect(await screen.findByTestId('photo-permission')).toBeTruthy();
    setPicker({ granted: true });
  });

  it('registra el peso del día (corregir el mismo día no duplica) y valida el rango', async () => {
    const fake = signedInFake();
    renderRouter(APP_DIR, { initialUrl: '/nutrition/weight' });
    fireEvent.changeText(await screen.findByTestId('weight-input'), '500');
    await press(screen.getByTestId('save-weight'));
    expect(await screen.findByText('Escribe un peso entre 25 y 350 kg.')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('weight-input'), '80,4');
    await press(screen.getByTestId('save-weight'));
    await waitFor(() => expect(fake.rows('weight_logs')).toHaveLength(1));
    fireEvent.changeText(screen.getByTestId('weight-input'), '80,1');
    await press(screen.getByTestId('save-weight'));
    await waitFor(() => expect(fake.rows('weight_logs')[0].weight_kg).toBe(80.1));
    expect(fake.rows('weight_logs')).toHaveLength(1);
  });
});
