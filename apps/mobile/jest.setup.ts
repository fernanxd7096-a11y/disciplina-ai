// Las fuentes de iconos se cargan de forma asíncrona y provocan avisos de act()
// que no reflejan un error de la app. En pruebas se consideran ya cargadas.
jest.mock('expo-font', () => {
  const actual = jest.requireActual('expo-font');
  return { ...actual, isLoaded: () => true, loadAsync: jest.fn(() => Promise.resolve()) };
});
