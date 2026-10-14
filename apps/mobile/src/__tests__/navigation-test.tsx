import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { signedInFake } from '@/test/setup';

/**
 * Navegación con sesión iniciada, sobre el árbol real de rutas de src/app.
 * Verifica que cada botón visible lleva a una pantalla existente.
 */
const APP_DIR = './src/app';

beforeEach(() => {
  signedInFake();
});

describe('navegación con sesión', () => {
  it('abre en el inicio con saludo', async () => {
    const app = renderRouter(APP_DIR, { initialUrl: '/' });
    expect(await screen.findByTestId('dashboard-screen')).toBeTruthy();
    expect(app.getPathname()).toBe('/');
    expect(screen.getByText(/Buenos días|Buenas tardes|Buenas noches/)).toBeTruthy();
  });

  it.each([
    ['/habits', 'habits-screen'],
    ['/planner', 'planner-screen'],
    ['/training', 'training-screen'],
    ['/nutrition', 'nutrition-screen'],
    ['/assistant', 'assistant-screen'],
    ['/stats', 'stats-screen'],
    ['/settings', 'settings-screen'],
  ])('la ruta %s muestra su pantalla', async (url, testID) => {
    const app = renderRouter(APP_DIR, { initialUrl: url });
    expect(await screen.findByTestId(testID)).toBeTruthy();
    expect(app.getPathname()).toBe(url);
  });

  it('con sesión iniciada, las pantallas de acceso redirigen al inicio', async () => {
    renderRouter(APP_DIR, { initialUrl: '/sign-in' });
    expect(await screen.findByTestId('dashboard-screen')).toBeTruthy();
  });

  it('el botón de ajustes del inicio abre ajustes', async () => {
    const app = renderRouter(APP_DIR, { initialUrl: '/' });
    fireEvent.press(await screen.findByRole('button', { name: 'Abrir ajustes' }));
    expect(app.getPathname()).toBe('/settings');
  });

  it('el botón Asistente del inicio abre el asistente', async () => {
    const app = renderRouter(APP_DIR, { initialUrl: '/' });
    fireEvent.press(await screen.findByTestId('open-assistant'));
    expect(app.getPathname()).toBe('/assistant');
  });

  it('el botón Estadísticas del inicio abre estadísticas', async () => {
    const app = renderRouter(APP_DIR, { initialUrl: '/' });
    fireEvent.press(await screen.findByTestId('open-stats'));
    expect(app.getPathname()).toBe('/stats');
  });

  it('la agenda cambia entre tareas, notas y calendario', async () => {
    renderRouter(APP_DIR, { initialUrl: '/planner' });
    expect(await screen.findByTestId('planner-empty-tasks')).toBeTruthy();
    fireEvent.press(screen.getByRole('tab', { name: 'Notas' }));
    expect(screen.getByTestId('planner-empty-notes')).toBeTruthy();
    fireEvent.press(screen.getByRole('tab', { name: 'Calendario' }));
    expect(screen.getByTestId('planner-empty-calendar')).toBeTruthy();
  });
});
