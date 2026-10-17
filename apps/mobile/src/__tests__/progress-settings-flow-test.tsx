import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import * as Sharing from 'expo-sharing';

import { localDayKey } from '@/lib/dates';
import type { FakeSupabase } from '@/test/fakeSupabase';
import { signedInFake } from '@/test/setup';

const APP_DIR = './src/app';
const today = () => localDayKey(new Date(), 'America/Lima');

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el);
  });
}

function seedActivity(fake: FakeSupabase) {
  const uid = fake.session!.user.id;
  const now = new Date().toISOString();
  fake.seed('habits', [
    { id: 'h1', user_id: uid, name: 'Leer', icon: null, color: null, category: 'reading', frequency: 'daily', days_of_week: [0, 1, 2, 3, 4, 5, 6], target_per_period: 1, unit: null, reminder_time: null, status: 'active', start_date: '2026-01-01', sort_order: 0, created_at: '', updated_at: '', deleted_at: null },
  ]);
  fake.seed('habit_logs', [{ id: 'l1', user_id: uid, habit_id: 'h1', log_date: today(), value: 1, note: null, deleted_at: null }]);
  fake.seed('tasks', [{ id: 't1', user_id: uid, title: 'Hecha', description: null, priority: 3, due_at: null, status: 'done', completed_at: now, rescheduled_count: 0, category_id: null, created_at: now, updated_at: now, deleted_at: null }]);
  fake.seed('workout_sessions', [{ id: 's1', user_id: uid, plan_id: null, day_index: null, title: 'Empuje', started_at: new Date(Date.now() - 3_600_000).toISOString(), finished_at: now, perceived_effort: 7, notes: null, deleted_at: null }]);
  fake.seed('privacy_settings', [{ user_id: uid, ai_use_habits: true, ai_use_planner: true, ai_use_training: true, ai_use_nutrition: true, keep_food_photos: false }]);
}

describe('progreso, inicio y ajustes', () => {
  it('el inicio resume entrenamiento, nutrición y progreso con datos reales', async () => {
    const fake = signedInFake();
    seedActivity(fake);
    fake.seed('meals', [{ id: 'm1', user_id: fake.session!.user.id, eaten_at: new Date().toISOString(), meal_type: 'lunch', origin: 'manual', analysis_id: null, photo_path: null, notes: null, deleted_at: null }]);
    fake.seed('meal_items', [{ id: 'i1', user_id: fake.session!.user.id, meal_id: 'm1', food_id: null, name: 'Arroz', grams: 200, kcal: 260, protein_g: 5, carbs_g: 56, fat_g: 1, is_ai_estimate: false, user_edited: false }]);
    renderRouter(APP_DIR, { initialUrl: '/' });

    await screen.findByTestId('dash-training');
    await waitFor(() => expect(within(screen.getByTestId('dash-training')).getByText('Hecho hoy: Empuje')).toBeTruthy());
    await waitFor(() => expect(within(screen.getByTestId('dash-nutrition')).getByText('260 kcal hoy')).toBeTruthy());
    // 1 hábito (10) + 1 tarea (15) + 1 entrenamiento (40) + 1 día con comidas (5) = 70 XP
    await waitFor(() => expect(within(screen.getByTestId('dash-progress')).getByText(/70 XP/)).toBeTruthy());
    expect(screen.getByTestId('quick-new-note')).toBeTruthy();
  });

  it('estadísticas: calcula disciplina y guarda los logros desbloqueados una sola vez', async () => {
    const fake = signedInFake();
    seedActivity(fake);
    renderRouter(APP_DIR, { initialUrl: '/stats' });
    expect(await screen.findByTestId('discipline-card')).toBeTruthy();
    expect(within(screen.getByTestId('level-card')).getByText('Nivel 1')).toBeTruthy();
    await waitFor(() => expect(fake.rows('user_achievements').map((a) => a.code).sort()).toEqual(['first_habit', 'first_task', 'first_workout']));
    await waitFor(() => expect(within(screen.getByTestId('ach-first_workout')).queryByText(/\d\/\d/)).toBeNull());
    expect(within(screen.getByTestId('ach-workouts_10')).getByText('1/10')).toBeTruthy();
    // Cambiar de periodo no duplica logros
    await press(screen.getByRole('tab', { name: '7 días' }));
    expect(fake.rows('user_achievements')).toHaveLength(3);
    await waitFor(() => expect(within(screen.getByTestId('stats-tasks')).getByText('1')).toBeTruthy());
  });

  it('privacidad: el usuario decide qué usa la IA y si se guardan las fotos', async () => {
    const fake = signedInFake();
    seedActivity(fake);
    renderRouter(APP_DIR, { initialUrl: '/settings' });
    const nutri = await screen.findByTestId('ai-nutrition');
    await act(async () => {
      fireEvent(nutri, 'valueChange', false);
    });
    await act(async () => {
      fireEvent(screen.getByTestId('keep-photos'), 'valueChange', true);
    });
    await waitFor(() => expect(fake.rows('privacy_settings')[0]).toMatchObject({ ai_use_nutrition: false, keep_food_photos: true }));
  });

  it('disciplina configurable (al menos un componente)', async () => {
    const fake = signedInFake();
    fake.tables.profiles[0].discipline_config = { habits: true, tasks: true, training: true };
    renderRouter(APP_DIR, { initialUrl: '/settings' });
    await screen.findByText('Porcentaje de disciplina');
    await act(async () => {
      fireEvent(screen.getByTestId('disc-tasks'), 'valueChange', false);
    });
    await waitFor(() => expect(fake.rows('profiles')[0].discipline_config).toEqual({ habits: true, tasks: false, training: true }));
  });

  it('exporta todos los datos del usuario en JSON', async () => {
    const fake = signedInFake();
    seedActivity(fake);
    renderRouter(APP_DIR, { initialUrl: '/settings' });
    await press(await screen.findByTestId('export-data'));
    expect(await screen.findByTestId('export-done')).toBeTruthy();
    const files = (globalThis as unknown as { __files: Map<string, string> }).__files;
    const [uri, content] = [...files.entries()].at(-1)!;
    expect(uri).toMatch(/disciplina-ai-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(content);
    expect(data.tables.habits).toHaveLength(1);
    expect(data.tables.tasks).toHaveLength(1);
    expect(data.tables.workout_sessions).toHaveLength(1);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(uri, expect.objectContaining({ mimeType: 'application/json' }));
  });

  it('borrar la cuenta exige confirmación escrita, borra fotos y datos y cierra sesión', async () => {
    const fake = signedInFake();
    seedActivity(fake);
    const uid = fake.session!.user.id;
    fake.files.set(`food-photos/${uid}/a.jpg`, 'x');
    fake.files.set('food-photos/otro-usuario/b.jpg', 'y');
    renderRouter(APP_DIR, { initialUrl: '/settings' });

    await press(await screen.findByTestId('delete-account'));
    const confirm = screen.getByTestId('delete-account-confirm');
    expect(confirm.props.accessibilityState.disabled).toBe(true);
    fireEvent.changeText(screen.getByTestId('delete-confirm'), 'BORRAR');
    await press(screen.getByTestId('delete-account-confirm'));

    expect(await screen.findByTestId('sign-in-screen')).toBeTruthy();
    expect(fake.files.has(`food-photos/${uid}/a.jpg`)).toBe(false);
    expect(fake.files.has('food-photos/otro-usuario/b.jpg')).toBe(true);
    expect(fake.calls.some((c) => c.table === 'rpc:delete_my_account')).toBe(true);
    expect(fake.tables.habits.filter((h) => h.user_id === uid)).toHaveLength(0);
  });
});
