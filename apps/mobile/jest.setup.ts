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

// Cámara y galería falsas: las pruebas eligen el resultado con globalThis.__picker.
jest.mock('expo-image-picker', () => {
  const mockPicker = { result: { canceled: true, assets: null }, granted: true };
  globalThis.__picker = mockPicker;
  return {
    requestCameraPermissionsAsync: jest.fn(async () => ({ granted: mockPicker.granted, canAskAgain: true })),
    requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: mockPicker.granted, canAskAgain: true })),
    launchCameraAsync: jest.fn(async () => mockPicker.result),
    launchImageLibraryAsync: jest.fn(async () => mockPicker.result),
  };
});

// Redimensionado: devuelve un JPEG mínimo en base64 (cabecera FF D8 FF).
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
  ImageManipulator: {
    manipulate: () => {
      const ctx = {
        resize: () => ctx,
        renderAsync: async () => ({
          width: 2000,
          height: 1500,
          saveAsync: async () => ({ uri: 'file:///tmp/out.jpg', width: 1280, height: 960, base64: '/9j/4AAQ' }),
        }),
      };
      return ctx;
    },
  },
}));

// Archivos y compartir (exportar datos).
jest.mock('expo-file-system', () => {
  const written = new Map();
  globalThis.__files = written;
  class MockFile {
    constructor(dir, name) {
      this.uri = `${dir}/${name}`;
    }
    create() {}
    write(content) {
      written.set(this.uri, content);
    }
    get exists() {
      return written.has(this.uri);
    }
    delete() {
      written.delete(this.uri);
    }
  }
  return { File: MockFile, Paths: { cache: 'file:///cache', document: 'file:///docs' } };
});
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

// expo-crypto: el módulo nativo no existe en Node; randomUUID usa el de Node.
jest.mock('expo-crypto', () => ({
  ...jest.requireActual('expo-crypto'),
  randomUUID: () => require('node:crypto').randomUUID(),
}));
