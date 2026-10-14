// Las fuentes de iconos se cargan de forma asíncrona y provocan avisos de act()
// que no reflejan un error de la app. En pruebas se consideran ya cargadas.
jest.mock('expo-font', () => {
  const actual = jest.requireActual('expo-font');
  return { ...actual, isLoaded: () => true, loadAsync: jest.fn(() => Promise.resolve()) };
});

// La app nunca habla con Supabase real en pruebas: usa el falso en memoria
// que cada prueba instala con setFakeSupabase() (src/test/setup.ts).
jest.mock('@/lib/supabase', () => ({
  get supabase() {
    return (globalThis as { __fakeSupabase?: { asClient(): unknown } }).__fakeSupabase?.asClient() ?? null;
  },
}));

// Teléfono falso para notificaciones: guarda lo programado para poder verificarlo.
// Así las pruebas ejecutan el reconciliador real (plan.ts + notifications.ts).
jest.mock('expo-notifications', () => {
  const scheduled = new Map<string, { identifier: string; content: unknown; trigger: unknown }>();
  const state = { granted: true, canAskAgain: true };
  (globalThis as { __notifications?: unknown }).__notifications = { scheduled, state };
  return {
    SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly', CALENDAR: 'calendar', TIME_INTERVAL: 'timeInterval' },
    AndroidImportance: { DEFAULT: 3, HIGH: 4 },
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn(async () => null),
    getPermissionsAsync: jest.fn(async () => ({ granted: state.granted, canAskAgain: state.canAskAgain })),
    requestPermissionsAsync: jest.fn(async () => ({ granted: state.granted, canAskAgain: state.canAskAgain })),
    getAllScheduledNotificationsAsync: jest.fn(async () => [...scheduled.values()]),
    scheduleNotificationAsync: jest.fn(async (req: { identifier: string; content: unknown; trigger: unknown }) => {
      scheduled.set(req.identifier, req);
      return req.identifier;
    }),
    cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
      scheduled.delete(id);
    }),
    addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  };
});
