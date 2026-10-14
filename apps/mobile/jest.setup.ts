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
