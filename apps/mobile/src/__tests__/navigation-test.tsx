import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

/**
 * Pruebas de navegación sobre el árbol real de rutas de src/app.
 * Verifican que cada botón visible lleva a una pantalla existente.
 */
const APP_DIR = './src/app';

describe('navegación', () => {
  it('abre en el inicio con saludo', () => {
    const app = renderRouter(APP_DIR, { initialUrl: '/' });
    expect(app.getPathname()).toBe('/');
    expect(screen.getByTestId('dashboard-screen')).toBeTruthy();
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
  ])('la ruta %s muestra su pantalla', (url, testID) => {
    const app = renderRouter(APP_DIR, { initialUrl: url });
    expect(app.getPathname()).toBe(url);
    expect(screen.getByTestId(testID)).toBeTruthy();
  });

  it('el botón de ajustes del inicio abre ajustes', () => {
    const app = renderRouter(APP_DIR, { initialUrl: '/' });
    fireEvent.press(screen.getByRole('button', { name: 'Abrir ajustes' }));
    expect(app.getPathname()).toBe('/settings');
  });

  it('el botón Asistente del inicio abre el asistente', () => {
    const app = renderRouter(APP_DIR, { initialUrl: '/' });
    fireEvent.press(screen.getByTestId('open-assistant'));
    expect(app.getPathname()).toBe('/assistant');
  });

  it('el botón Estadísticas del inicio abre estadísticas', () => {
    const app = renderRouter(APP_DIR, { initialUrl: '/' });
    fireEvent.press(screen.getByTestId('open-stats'));
    expect(app.getPathname()).toBe('/stats');
  });

  it('la agenda cambia entre tareas, notas y calendario', () => {
    renderRouter(APP_DIR, { initialUrl: '/planner' });
    expect(screen.getByTestId('planner-empty-tasks')).toBeTruthy();
    fireEvent.press(screen.getByRole('tab', { name: 'Notas' }));
    expect(screen.getByTestId('planner-empty-notes')).toBeTruthy();
    fireEvent.press(screen.getByRole('tab', { name: 'Calendario' }));
    expect(screen.getByTestId('planner-empty-calendar')).toBeTruthy();
  });
});
