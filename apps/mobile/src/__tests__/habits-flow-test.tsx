import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { localDayKey } from '@/lib/dates';
import { signedInFake } from '@/test/setup';
import type { FakeSupabase } from '@/test/fakeSupabase';

const APP_DIR = './src/app';
const today = () => localDayKey(new Date(), 'America/Lima');

function seedHabit(fake: FakeSupabase, over: Record<string, unknown> = {}) {
  const uid = fake.session!.user.id;
  const row = {
    id: 'h-leer',
    user_id: uid,
    name: 'Leer 20 minutos',
    icon: null,
    color: null,
    category: 'reading',
    frequency: 'daily',
    days_of_week: [0, 1, 2, 3, 4, 5, 6],
    target_per_period: 1,
    unit: null,
    reminder_time: null,
    status: 'active',
    start_date: '2026-01-01',
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
  fake.seed('habits', [row]);
  return row;
}

describe('hábitos', () => {
  it('sin hábitos muestra el estado vacío con acción real', async () => {
    signedInFake();
    renderRouter(APP_DIR, { initialUrl: '/habits' });
    expect(await screen.findByTestId('habits-empty')).toBeTruthy();
  });

  it('crea un hábito desde una plantilla y aparece en la lista de hoy', async () => {
    const fake = signedInFake();
    renderRouter(APP_DIR, { initialUrl: '/habits' });

    fireEvent.press(await screen.findByTestId('new-habit'));
    fireEvent.press(await screen.findByTestId('preset-reading'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('save-habit'));
    });

    expect(await screen.findByText('Leer 20 minutos')).toBeTruthy();
    expect(fake.rows('habits')).toHaveLength(1);
    expect(fake.rows('habits')[0]).toMatchObject({ name: 'Leer 20 minutos', category: 'reading', start_date: today() });
  });

  it('el formulario exige nombre y al menos un día', async () => {
    const fake = signedInFake();
    renderRouter(APP_DIR, { initialUrl: '/habit/new' });
    await screen.findByTestId('habit-form-screen');
    for (const d of [0, 1, 2, 3, 4, 5, 6]) fireEvent.press(screen.getByTestId(`day-${d}`));
    fireEvent.press(screen.getByTestId('save-habit'));
    expect(await screen.findByText('Ponle un nombre al hábito.')).toBeTruthy();
    expect(screen.getByText('Elige al menos un día.')).toBeTruthy();
    expect(fake.rows('habits')).toHaveLength(0);
  });

  it('marcar un hábito guarda el registro de hoy y actualiza el progreso', async () => {
    const fake = signedInFake();
    seedHabit(fake);
    renderRouter(APP_DIR, { initialUrl: '/habits' });

    const check = await screen.findByTestId('check-h-leer');
    await act(async () => {
      fireEvent.press(check);
    });

    await waitFor(() => expect(fake.rows('habit_logs')).toHaveLength(1));
    expect(fake.rows('habit_logs')[0]).toMatchObject({ habit_id: 'h-leer', log_date: today(), value: 1 });
    expect(await screen.findByText('¡Todo listo por hoy!')).toBeTruthy();

    // Desmarcar borra el registro
    await act(async () => {
      fireEvent.press(screen.getByTestId('check-h-leer'));
    });
    await waitFor(() => expect(fake.rows('habit_logs')).toHaveLength(0));
  });

  it('un contador suma de uno en uno hasta la meta', async () => {
    const fake = signedInFake();
    seedHabit(fake, { id: 'h-agua', name: 'Beber agua', category: 'water', target_per_period: 3, unit: 'vasos' });
    renderRouter(APP_DIR, { initialUrl: '/habits' });

    for (let i = 0; i < 2; i++) {
      const check = await screen.findByTestId('check-h-agua');
      await act(async () => {
        fireEvent.press(check);
      });
    }
    await waitFor(() => expect(fake.rows('habit_logs')[0]?.value).toBe(2));
    expect(await screen.findByText('2 de 3 vasos')).toBeTruthy();
  });

  it('dos toques rápidos seguidos cuentan dos (sin carreras)', async () => {
    const fake = signedInFake();
    seedHabit(fake, { id: 'h-agua', name: 'Beber agua', category: 'water', target_per_period: 8, unit: 'vasos' });
    renderRouter(APP_DIR, { initialUrl: '/habits' });
    const check = await screen.findByTestId('check-h-agua');

    await act(async () => {
      fireEvent.press(check);
      fireEvent.press(check);
    });

    await waitFor(() => expect(fake.rows('habit_logs')[0]?.value).toBe(2));
    expect(await screen.findByText('2 de 8 vasos')).toBeTruthy();
  });

  it('si falla el guardado, revierte el cambio y avisa', async () => {
    const fake = signedInFake();
    seedHabit(fake);
    renderRouter(APP_DIR, { initialUrl: '/habits' });
    await screen.findByTestId('check-h-leer');
    fake.failingTables.add('habit_logs');

    await act(async () => {
      fireEvent.press(screen.getByTestId('check-h-leer'));
    });
    expect(await screen.findByText(/No se pudo guardar el último cambio/)).toBeTruthy();
    expect(screen.getByText('Te faltan 1')).toBeTruthy();
  });

  it('el día de descanso se guarda y se anuncia', async () => {
    const fake = signedInFake();
    seedHabit(fake);
    renderRouter(APP_DIR, { initialUrl: '/habits' });
    const restButton = await screen.findByTestId('toggle-rest-day');
    await act(async () => {
      fireEvent.press(restButton);
    });
    await waitFor(() => expect(fake.rows('rest_days')).toHaveLength(1));
    expect(fake.rows('rest_days')[0].date).toBe(today());
    expect(await screen.findByText('Día de descanso')).toBeTruthy();
  });

  it('el detalle permite pausar y eliminar', async () => {
    const fake = signedInFake();
    seedHabit(fake);
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const app = renderRouter(APP_DIR, { initialUrl: '/habit/h-leer' });

    const pause = await screen.findByTestId('pause-habit');
    await act(async () => {
      fireEvent.press(pause);
    });
    await waitFor(() => expect(fake.rows('habits')[0].status).toBe('paused'));
    expect(await screen.findByText('En pausa')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('delete-habit'));
    });
    await waitFor(() => expect(fake.rows('habits')[0].deleted_at).not.toBeNull());
    expect(app.getPathname()).not.toBe('/habit/h-leer');
  });

  it('el inicio muestra el progreso real y permite marcar desde ahí', async () => {
    const fake = signedInFake();
    seedHabit(fake);
    renderRouter(APP_DIR, { initialUrl: '/' });

    const progress = await screen.findByTestId('today-progress');
    expect(await within(progress).findByText('0%')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('check-h-leer'));
    });
    expect(await within(progress).findByText('100%')).toBeTruthy();
    expect(screen.getByText('¡Completaste todos los hábitos de hoy!')).toBeTruthy();
  });
});
