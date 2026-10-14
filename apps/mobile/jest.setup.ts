// @ts-nocheck — fábricas de jest.mock sin tipos (el plugin de hoisting no admite anotaciones dentro).
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

// Almacenamiento del teléfono en memoria (mock oficial de AsyncStorage).
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- las fábricas de jest.mock usan require
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Red falsa controlable desde las pruebas (setNetwork en src/test/network.ts).
jest.mock('@react-native-community/netinfo', () => {
  const mockNet = { state: { isConnected: true, isInternetReachable: true }, listeners: new Set() };
  globalThis.__net = mockNet;
  return {
    __esModule: true,
    default: {
      addEventListener: (cb) => {
        mockNet.listeners.add(cb);
        cb(mockNet.state);
        return () => mockNet.listeners.delete(cb);
      },
      fetch: async () => mockNet.state,
    },
  };
});
