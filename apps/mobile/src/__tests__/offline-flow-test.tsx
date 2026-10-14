import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import type { FakeSupabase } from '@/test/fakeSupabase';
import { setNetwork } from '@/test/network';
import { signedInFake } from '@/test/setup';

const APP_DIR = './src/app';

function seedHabit(fake: FakeSupabase) {
  fake.seed('habits', [
    {
      id: 'h1', user_id: fake.session!.user.id, name: 'Leer 20 minutos', icon: null, color: null, category: 'reading',
      frequency: 'daily', days_of_week: [0, 1, 2, 3, 4, 5, 6], target_per_period: 1, unit: null, reminder_time: null,
      status: 'active', start_date: '2026-01-01', sort_order: 0, created_at: '', updated_at: '', deleted_at: null,
    },
  ]);
}

/** Deja que el persistidor (que agrupa escrituras cada 1 s) guarde la caché. */
async function flushPersist() {
  await act(async () => {
    jest.advanceTimersByTime(1500);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe('sin conexión', () => {
  it('muestra el aviso al perder la red y lo quita al volver', async () => {
    signedInFake();
    renderRouter(APP_DIR, { initialUrl: '/' });
    await screen.findByTestId('dashboard-screen');
    expect(screen.queryByTestId('offline-banner')).toBeNull();

    await setNetwork(false);
    expect(await screen.findByTestId('offline-banner')).toBeTruthy();

    await setNetwork(true);
    await waitFor(() => expect(screen.queryByTestId('offline-banner')).toBeNull());
  });

  it('marcar un hábito sin red se ve al instante y se guarda al reconectar', async () => {
    const fake = signedInFake();
    seedHabit(fake);
    renderRouter(APP_DIR, { initialUrl: '/habits' });
    const check = await screen.findByTestId('check-h1');

    await setNetwork(false);
    await act(async () => {
      fireEvent.press(check);
    });
    expect(await screen.findByText('¡Todo listo por hoy!')).toBeTruthy();
    expect(fake.rows('habit_logs')).toHaveLength(0); // aún no llegó al servidor

    await setNetwork(true);
    await waitFor(() => expect(fake.rows('habit_logs')).toHaveLength(1));
  });

  it('un formulario sin red avisa y no finge guardar', async () => {
    const fake = signedInFake();
    renderRouter(APP_DIR, { initialUrl: '/task/new' });
    fireEvent.changeText(await screen.findByTestId('task-title'), 'Algo');
    await setNetwork(false);
    await act(async () => {
      fireEvent.press(screen.getByTestId('save-task'));
    });
    expect(await screen.findByTestId('offline-save')).toBeTruthy();
    expect(fake.calls.filter((c) => c.table === 'tasks' && c.op === 'insert')).toHaveLength(0);
  });

  it('al reabrir la app sin red, los datos se muestran desde la caché del teléfono', async () => {
    const fake = signedInFake();
    seedHabit(fake);
    const first = renderRouter(APP_DIR, { initialUrl: '/habits' });
    expect(await screen.findByText('Leer 20 minutos')).toBeTruthy();
    await flushPersist();
    expect(await AsyncStorage.getItem('disciplina.cache')).toContain('Leer 20 minutos');
    first.unmount();

    // El servidor "desaparece": sin red y sin datos remotos.
    await setNetwork(false);
    fake.tables.habits = [];
    renderRouter(APP_DIR, { initialUrl: '/habits' });
    expect(await screen.findByText('Leer 20 minutos')).toBeTruthy();
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
  });

  it('cerrar sesión borra la caché guardada en el teléfono', async () => {
    const fake = signedInFake();
    seedHabit(fake);
    const { Alert } = jest.requireActual('react-native');
    jest.spyOn(Alert, 'alert').mockImplementation((...args: unknown[]) => {
      const buttons = args[2] as { style?: string; onPress?: () => void }[];
      buttons.find((b) => b.style === 'destructive')?.onPress?.();
    });
    // Ajustes también carga los hábitos (la sincronización de avisos los usa).
    renderRouter(APP_DIR, { initialUrl: '/settings' });
    const signOut = await screen.findByTestId('sign-out');
    await waitFor(async () => expect(await AsyncStorage.getItem('disciplina.cache')).toContain('Leer 20 minutos'));

    await act(async () => {
      fireEvent.press(signOut);
    });
    await screen.findByTestId('sign-in-screen');
    await flushPersist();
    expect((await AsyncStorage.getItem('disciplina.cache')) ?? '').not.toContain('Leer 20 minutos');
  });
});
