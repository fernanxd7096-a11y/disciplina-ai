import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import { EXERCISES } from '@/test/catalog';
import type { FakeSupabase } from '@/test/fakeSupabase';
import { signedInFake } from '@/test/setup';

const APP_DIR = './src/app';

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el);
  });
}

function seedCatalog(fake: FakeSupabase) {
  fake.seed('exercises', EXERCISES.map((e) => ({ ...e })));
}

function seedProfile(fake: FakeSupabase, over: Record<string, unknown> = {}) {
  fake.seed('fitness_profiles', [
    { user_id: fake.session!.user.id, goal: 'gain_muscle', experience: 'beginner', days_per_week: 3, minutes_per_session: 45, equipment: ['dumbbells'], limitations: null, ...over },
  ]);
}

describe('entrenamiento', () => {
  it('sin perfil pide completarlo y guarda perfil + datos corporales + peso', async () => {
    const fake = signedInFake();
    seedCatalog(fake);
    renderRouter(APP_DIR, { initialUrl: '/training' });

    await press(await screen.findByText('Completar perfil'));
    await press(await screen.findByTestId('goal-strength'));
    await press(screen.getByTestId('minutes-60'));
    await press(screen.getByTestId('equip-dumbbells'));
    fireEvent.changeText(screen.getByTestId('height'), '175');
    fireEvent.changeText(screen.getByTestId('weight'), '80,5');
    await press(screen.getByTestId('save-fitness-profile'));

    await waitFor(() => expect(fake.rows('fitness_profiles')).toHaveLength(1));
    expect(fake.rows('fitness_profiles')[0]).toMatchObject({ goal: 'strength', minutes_per_session: 60, equipment: ['dumbbells'], days_per_week: 3 });
    await waitFor(() => expect(fake.rows('weight_logs')[0]).toMatchObject({ weight_kg: 80.5 }));
    expect(fake.rows('profiles')[0]).toMatchObject({ height_cm: 175 });
    expect(await screen.findByTestId('training-no-plan')).toBeTruthy();
  });

  it('valida el perfil (altura fuera de rango)', async () => {
    const fake = signedInFake();
    renderRouter(APP_DIR, { initialUrl: '/training/profile' });
    fireEvent.changeText(await screen.findByTestId('height'), '20');
    await press(screen.getByTestId('save-fitness-profile'));
    expect(await screen.findByText('Altura entre 100 y 250.')).toBeTruthy();
    expect(fake.rows('fitness_profiles')).toHaveLength(0);
  });

  it('genera la rutina base, permite cambiar un ejercicio y la guarda como activa', async () => {
    const fake = signedInFake();
    seedCatalog(fake);
    seedProfile(fake);
    renderRouter(APP_DIR, { initialUrl: '/training/plan-new?mode=basic' });

    expect(await screen.findByText('Rutina 3 días por semana')).toBeTruthy();
    // Cambia el primer ejercicio de pecho por una alternativa
    const swap = screen.getAllByLabelText(/^Cambiar /)[0];
    await press(swap);
    const alt = screen.getAllByTestId(/^alt-/)[0];
    await press(alt);
    await press(screen.getByTestId('save-plan'));

    await waitFor(() => expect(fake.rows('workout_plans')).toHaveLength(1));
    const plan = fake.rows('workout_plans')[0];
    expect(plan).toMatchObject({ active: true, source: 'manual', day_labels: ['Cuerpo completo A', 'Cuerpo completo B', 'Cuerpo completo C'] });
    const items = fake.rows('plan_exercises');
    expect(items.length).toBeGreaterThanOrEqual(6);
    expect(items.every((i) => i.plan_id === plan.id)).toBe(true);
    // Solo equipo disponible (peso corporal + mancuernas)
    const byId = new Map(EXERCISES.map((e) => [e.id, e]));
    expect(items.every((i) => ['bodyweight', 'dumbbells'].includes(byId.get(i.exercise_id as string)!.equipment))).toBe(true);
    expect(await screen.findByTestId('next-workout')).toBeTruthy();
  });

  it('entrena: registra series, sugiere progresión y termina la sesión', async () => {
    const fake = signedInFake();
    seedCatalog(fake);
    seedProfile(fake);
    const uid = fake.session!.user.id;
    const press1 = EXERCISES.find((e) => e.code === 'dumbbell_press')!;
    fake.seed('workout_plans', [{ id: 'p1', user_id: uid, name: 'Mi rutina', source: 'manual', day_labels: ['Empuje', 'Piernas'], notes: null, active: true, created_at: '', deleted_at: null }]);
    fake.seed('plan_exercises', [
      { id: 'pe1', user_id: uid, plan_id: 'p1', day_index: 0, exercise_id: press1.id, sets: 2, reps_min: 8, reps_max: 12, rest_seconds: 90, suggested_kg: null, sort_order: 0 },
    ]);
    // Sesión anterior: completó 2×12 con 10 kg → debe sugerir 11 kg
    fake.seed('workout_sessions', [{ id: 's0', user_id: uid, plan_id: 'p1', day_index: 1, title: 'Piernas', started_at: new Date(Date.now() - 3 * 86_400_000).toISOString(), finished_at: new Date(Date.now() - 3 * 86_400_000 + 3_600_000).toISOString(), perceived_effort: 7, notes: null, deleted_at: null }]);
    fake.seed('set_logs', [
      { id: 'x1', user_id: uid, session_id: 's0', exercise_id: press1.id, set_number: 1, reps: 12, weight_kg: 10, created_at: new Date().toISOString() },
      { id: 'x2', user_id: uid, session_id: 's0', exercise_id: press1.id, set_number: 2, reps: 12, weight_kg: 10, created_at: new Date().toISOString() },
    ]);
    renderRouter(APP_DIR, { initialUrl: '/training' });

    // Después de Piernas (día 2) toca Empuje (día 1)
    expect(within(await screen.findByTestId('next-workout')).getByText('Empuje')).toBeTruthy();
    expect(screen.getByTestId('week-progress').props.children.join('')).toMatch(/de 3/);
    await press(screen.getByTestId('start-workout'));

    expect(await screen.findByTestId('session-screen')).toBeTruthy();
    expect(screen.getByTestId('suggestion-dumbbell_press').props.children).toMatch(/sube a 11 kg/);
    expect(screen.getByTestId('kg-dumbbell_press').props.value).toBe('11');
    await press(screen.getByTestId('log-dumbbell_press'));
    expect(await screen.findByTestId('set-dumbbell_press-1')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('reps-dumbbell_press'), '7');
    await press(screen.getByTestId('log-dumbbell_press'));
    await waitFor(() => expect(fake.rows('set_logs').filter((s) => s.session_id !== 's0')).toHaveLength(2));
    const logged = fake.rows('set_logs').filter((s) => s.session_id !== 's0');
    expect(logged.map((s) => [s.set_number, s.reps, s.weight_kg])).toEqual([
      [1, 8, 11],
      [2, 7, 11],
    ]);

    await press(screen.getByTestId('effort-8'));
    await press(screen.getByTestId('finish-session'));
    await waitFor(() => expect(fake.rows('workout_sessions').find((s) => s.id !== 's0')?.finished_at).toBeTruthy());
    expect(fake.rows('workout_sessions').find((s) => s.id !== 's0')).toMatchObject({ title: 'Empuje', perceived_effort: 8, day_index: 0 });
    expect(await screen.findByTestId('training-screen')).toBeTruthy();
  });

  it('la rutina con IA muestra el error y permite usar la rutina base', async () => {
    const fake = signedInFake();
    seedCatalog(fake);
    seedProfile(fake);
    fake.functionHandlers['workout-plan'] = () => ({
      error: { message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify({ error: { code: 'ai_not_configured', message: 'x' } }), { status: 503 }) },
    });
    renderRouter(APP_DIR, { initialUrl: '/training/plan-new?mode=ai' });
    await press(await screen.findByTestId('ai-plan-generate'));
    expect(await screen.findByTestId('ai-plan-error')).toBeTruthy();
    expect(await screen.findByText(/La IA todavía no está configurada/)).toBeTruthy();
    await press(screen.getByTestId('ai-plan-fallback'));
    expect(await screen.findByText('Rutina 3 días por semana')).toBeTruthy();
  });

  it('la rutina con IA se revisa antes de guardar y queda marcada como IA', async () => {
    const fake = signedInFake();
    seedCatalog(fake);
    seedProfile(fake, { days_per_week: 2 });
    const id = (code: string) => EXERCISES.find((e) => e.code === code)!.id;
    fake.functionHandlers['workout-plan'] = (body) => {
      expect(body).toEqual({ note: 'más espalda' });
      return {
        data: {
          provider: 'mock',
          model: 'mock',
          plan: {
            name: 'Espalda fuerte',
            notes: 'Progresa poco a poco.',
            safety_notes: ['Cuida la espalda baja.'],
            day_labels: ['A', 'B'],
            items: [
              { day_index: 0, exercise_id: id('dumbbell_row'), sets: 3, reps_min: 8, reps_max: 12, rest_seconds: 90, suggested_kg: null, sort_order: 0 },
              { day_index: 0, exercise_id: id('squat'), sets: 3, reps_min: 8, reps_max: 12, rest_seconds: 90, suggested_kg: null, sort_order: 1 },
              { day_index: 1, exercise_id: id('superman'), sets: 3, reps_min: 10, reps_max: 15, rest_seconds: 60, suggested_kg: null, sort_order: 0 },
              { day_index: 1, exercise_id: id('lunge'), sets: 3, reps_min: 8, reps_max: 12, rest_seconds: 90, suggested_kg: null, sort_order: 1 },
            ],
          },
        },
      };
    };
    renderRouter(APP_DIR, { initialUrl: '/training/plan-new?mode=ai' });
    fireEvent.changeText(await screen.findByTestId('ai-plan-note'), 'más espalda');
    await press(screen.getByTestId('ai-plan-generate'));
    expect(await screen.findByText('Espalda fuerte')).toBeTruthy();
    expect(screen.getByText('Modo prueba (IA simulada)')).toBeTruthy();
    expect(screen.getByText('⚠ Cuida la espalda baja.')).toBeTruthy();
    expect(fake.rows('workout_plans')).toHaveLength(0); // nada se guarda sin confirmar
    await press(screen.getByTestId('save-plan'));
    await waitFor(() => expect(fake.rows('workout_plans')[0]).toMatchObject({ source: 'ai', name: 'Espalda fuerte' }));
    expect(String(fake.rows('workout_plans')[0].notes)).toContain('⚠ Cuida la espalda baja.');
  });

  it('la ficha del ejercicio muestra técnica, errores y alternativas', async () => {
    const fake = signedInFake();
    seedCatalog(fake);
    const pushUp = EXERCISES.find((e) => e.code === 'push_up')!;
    renderRouter(APP_DIR, { initialUrl: `/training/exercise/${pushUp.id}` });
    expect(await screen.findByText('Técnica paso a paso')).toBeTruthy();
    expect(screen.getByText('Errores frecuentes')).toBeTruthy();
    expect(screen.getByText('Flexiones con rodillas apoyadas')).toBeTruthy();
  });
});
